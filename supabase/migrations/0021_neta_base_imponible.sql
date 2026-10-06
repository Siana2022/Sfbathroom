-- 0021_neta_base_imponible.sql
-- Alinear la "neta" de la app con Power BI: A3ERP/A3 BI muestran base imponible (sin IVA).
-- v_perf_facturacion_mensual pasa de sumar f.total (TOTMONEDA, con IVA+suplidos) a
-- f.base_imponible (BASEMONEDA). La columna neta_total conserva el nombre para no tocar
-- getFacturacion; cambia solo la semántica.
-- security_invoker = true se mantiene → la vista sigue heredando RLS de facturas/factura_lineas.

create or replace view public.v_perf_facturacion_mensual
with (security_invoker = true) as
with f_mes as (
  select
    f.empresa_id,
    extract(year from f.fecha)::integer as ejercicio,
    extract(month from f.fecha)::integer as mes,
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
    sum(f_mes.base_imponible) as neta_total,
    count(*) filter (where f_mes.tipo_documento = 'factura') as n_facturas
  from f_mes
  group by f_mes.empresa_id, f_mes.ejercicio, f_mes.mes
),
u as (
  select
    f_mes.empresa_id,
    f_mes.ejercicio,
    f_mes.mes,
    coalesce(sum(fl.cantidad), 0) as unidades
  from f_mes
  join public.factura_lineas fl on fl.factura_id = f_mes.id
  where f_mes.tipo_documento = 'factura'
  group by f_mes.empresa_id, f_mes.ejercicio, f_mes.mes
)
select
  m.empresa_id,
  m.ejercicio,
  m.mes,
  m.neta_total,
  m.n_facturas,
  coalesce(u.unidades, 0) as unidades
from m
left join u
  on u.empresa_id = m.empresa_id
 and u.ejercicio = m.ejercicio
 and u.mes = m.mes;

comment on view public.v_perf_facturacion_mensual is
  'Neta (base imponible, sin IVA), nº de facturas y unidades por empresa, ejercicio y mes. Unidades solo de tipo factura.';

grant select on public.v_perf_facturacion_mensual to authenticated;