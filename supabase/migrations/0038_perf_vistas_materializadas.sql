-- 0038_perf_vistas_materializadas.sql
-- Rendimiento multiempresa (P-mult, paso 2). Convierte el agregado mensual de facturación
-- en una MATERIALIZED VIEW, de modo que el SUM/GROUP BY mensual se calcula UNA vez al día
-- (tras la ingesta) y no en cada carga de página ni en cada cambio de empresa.
--
-- Semántica: idéntica a v_perf_facturacion_mensual tras 0026/0021:
--   * neta_total = SUM(base_imponible) de TODOS los tipos (factura + abono + nota_cargo).
--   * n_facturas = COUNT solo de tipo 'factura'.
--   * unidades   = unidades NETAS = SUM(cantidad) de líneas de factura+abono+nota_cargo
--                  (las líneas de abono vienen en negativo). Ver 0026.
--
-- RLS / cartera del comercial (CLAVE):
--   Una materialized view NO soporta RLS ni security_invoker, así que la matview contiene
--   los agregados de TODAS las empresas y comerciales. Para no filtrar RLS, la matview
--   añade `comercial_id` como DIMENSIÓN y la vista pública `v_perf_facturacion_mensual`
--   vuelve a agregar aplicando el MISMO filtro de cartera que la RLS de `facturas`
--   (patrón auth_role()/auth_comercial_id() de 0001/0004), re-sumando solo las filas que
--   el usuario puede ver.
--
--   Por eso la vista NO es `security_invoker` (a diferencia de 0007): necesita leer la
--   matview como su propietario (los usuarios `authenticated` NO reciben SELECT sobre la
--   matview, solo sobre la vista). La seguridad la da el WHERE con auth_role()/
--   auth_comercial_id(), no la RLS de la matview. Esto preserva exactamente la semántica
--   de visibilidad anterior.

-- ---------- 1. Materialized view por (empresa, ejercicio, mes, comercial) ----------
-- comercial_id puede ser NULL en facturas; se normaliza a un UUID centinela para que la
-- columna sea NOT NULL y el índice único (necesario para REFRESH ... CONCURRENTLY) no
-- tenga problemas con NULLs. El rol 'comercial' nunca iguala el centinela, así que esas
-- filas "sin comercial" solo las ven admin/direccion/financiero/lectura.
create materialized view if not exists public.mv_perf_facturacion_mensual as
with f_mes as (
  select
    f.empresa_id,
    extract(year from f.fecha)::integer as ejercicio,
    extract(month from f.fecha)::integer as mes,
    coalesce(f.comercial_id, '00000000-0000-0000-0000-000000000000'::uuid) as comercial_id,
    f.id,
    f.tipo_documento,
    f.base_imponible
  from public.facturas f
),
m as (
  select
    f_mes.empresa_id,
    f_mes.ejercicio,
    f_mes.mes,
    f_mes.comercial_id,
    sum(f_mes.base_imponible) as neta_total,
    count(*) filter (where f_mes.tipo_documento = 'factura') as n_facturas
  from f_mes
  group by f_mes.empresa_id, f_mes.ejercicio, f_mes.mes, f_mes.comercial_id
),
u as (
  select
    f_mes.empresa_id,
    f_mes.ejercicio,
    f_mes.mes,
    f_mes.comercial_id,
    coalesce(sum(fl.cantidad), 0) as unidades
  from f_mes
  join public.factura_lineas fl on fl.factura_id = f_mes.id
  where f_mes.tipo_documento in ('factura', 'abono', 'nota_cargo')
  group by f_mes.empresa_id, f_mes.ejercicio, f_mes.mes, f_mes.comercial_id
)
select
  m.empresa_id,
  m.ejercicio,
  m.mes,
  m.comercial_id,
  coalesce(m.neta_total, 0) as neta_total,
  m.n_facturas,
  coalesce(u.unidades, 0) as unidades
from m
left join u
  on u.empresa_id = m.empresa_id
 and u.ejercicio = m.ejercicio
 and u.mes = m.mes
 and u.comercial_id = m.comercial_id;

comment on materialized view public.mv_perf_facturacion_mensual is
  'Agregado mensual de facturación (neta base imponible, nº facturas, unidades netas) por '
  'empresa, ejercicio, mes y comercial. Refrescar con refresh_mv_perf() tras la ingesta diaria. '
  'No conceder SELECT a authenticated: se consulta a través de v_perf_facturacion_mensual.';

-- Índice único: obligatorio para REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists mv_perf_facturacion_mensual_uk
  on public.mv_perf_facturacion_mensual (empresa_id, ejercicio, mes, comercial_id);

-- Índice de lectura por (empresa, ejercicio) — como consulta la vista/app.
create index if not exists idx_mv_perf_empresa_ejercicio
  on public.mv_perf_facturacion_mensual (empresa_id, ejercicio);

-- IMPORTANTE: la matview NO se expone a los usuarios finales. Solo el propietario (y la
-- vista, que corre como propietario) la leen. No se hace `grant select ... to authenticated`.

-- ---------- 2. Vista compatible: misma firma que antes, re-agrega con cartera ----------
-- Mantiene la interfaz exacta que usa lib/datos/facturacion.ts
-- (columnas: empresa_id, ejercicio, mes, neta_total, n_facturas, unidades), de modo que el
-- código existente no cambia. Reemplaza la definición de 0026 (que leía las tablas base).
drop view if exists public.v_perf_facturacion_mensual;
create view public.v_perf_facturacion_mensual as
select
  empresa_id,
  ejercicio,
  mes,
  sum(neta_total) as neta_total,
  sum(n_facturas) as n_facturas,
  sum(unidades)   as unidades
from public.mv_perf_facturacion_mensual
where
  public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
group by empresa_id, ejercicio, mes;

comment on view public.v_perf_facturacion_mensual is
  'Neta (base imponible), nº facturas y unidades netas por empresa/ejercicio/mes. Lee de la '
  'materializada mv_perf_facturacion_mensual y re-agrega aplicando el filtro de cartera del rol '
  '(auth_role()/auth_comercial_id()), igual que la RLS de facturas. NO es security_invoker a '
  'propósito: debe leer la matview como propietario; la visibilidad la impone el WHERE.';

grant select on public.v_perf_facturacion_mensual to authenticated;

-- ---------- 3. Función de refresco (la llama la ingesta diaria) ----------
create or replace function public.refresh_mv_perf()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- CONCURRENTLY: no bloquea lecturas de la matview mientras refresca (requiere el índice
  -- único de arriba y que la matview ya esté poblada, cosa que garantiza su creación WITH DATA).
  refresh materialized view concurrently public.mv_perf_facturacion_mensual;
end;
$$;

comment on function public.refresh_mv_perf() is
  'Refresca mv_perf_facturacion_mensual de forma concurrente. Debe llamarse al terminar la '
  'ingesta diaria de A3ERP (ver ingesta/a3erp/src/vuelo.ts).';

revoke execute on function public.refresh_mv_perf() from public, anon;
grant execute on function public.refresh_mv_perf() to authenticated, service_role;

-- Primer refresco explícito no hace falta: `create materialized view` ya la crea WITH DATA.
-- A partir de aquí, la ingesta debe llamar a refresh_mv_perf() tras cada carga.
