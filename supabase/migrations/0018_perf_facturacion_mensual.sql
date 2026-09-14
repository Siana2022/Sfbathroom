-- 0018_perf_facturacion_mensual.sql
-- Optimización de portada: agregar facturación mensual en Postgres (P3).
-- Reemplaza el patrón de "traer todas las facturas + todas las líneas y sumar en JS".
-- security_invoker = true → la vista hereda RLS de facturas/factura_lineas (patrón 0007).

create view public.v_perf_facturacion_mensual
with (security_invoker = true) as
with f_mes as (
  select
    f.empresa_id,
    extract(year from f.fecha)::integer as ejercicio,
    extract(month from f.fecha)::integer as mes,
    f.id,
    f.tipo_documento,
    f.total
  from public.facturas f
),
m as (
  select
    f_mes.empresa_id,
    f_mes.ejercicio,
    f_mes.mes,
    sum(f_mes.total) as neta_total,
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
  'Neta, nº de facturas y unidades por empresa, ejercicio y mes. Unidades solo de tipo factura.';

grant select on public.v_perf_facturacion_mensual to authenticated;