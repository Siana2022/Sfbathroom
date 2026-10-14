-- 0026_unidades_netas_abonos.sql
-- El informe "Facturas de venta" de A3ERP cuenta las unidades NETAS: facturas + notas de
-- cargo − abonos (devoluciones). La app contaba solo 'factura' (bruto), así que salía de más
-- (p. ej. SF 35.071 vs 34.600). Como las líneas de abono ya vienen con cantidad NEGATIVA,
-- basta con incluir los tipos de la neta en la suma de unidades.
--
-- La neta (base imponible) ya sumaba todos los tipos; NO cambia. security_invoker se mantiene.
-- Importante: se sigue contando n_facturas solo de tipo 'factura'.

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
  where f_mes.tipo_documento in ('factura', 'abono', 'nota_cargo')
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
  'Neta (base imponible), nº de facturas y unidades NETAS (facturas + notas de cargo − abonos) por empresa, ejercicio y mes.';

grant select on public.v_perf_facturacion_mensual to authenticated;
