-- 0023_margen_base_imponible.sql
-- Alinea v_margen_por_articulo con el criterio de facturación neta del analítico:
-- el importe vendido se calcula sobre la base imponible de línea (factura_lineas.base_imponible,
-- que en el runner es la suma de LINEFACT.BASEMONEDA) en lugar de la columna generada fl.importe
-- (que solo aplicaba DESC1). Mismo criterio que lib/datos/margen.ts y v_perf_facturacion_mensual.
--
-- La vista no la consume la app (el bloque de margen se calcula en lib/datos/margen.ts), pero se
-- mantiene alineada por coherencia con el resto del esquema.

drop view if exists public.v_margen_por_articulo;

create view public.v_margen_por_articulo
with (security_invoker = true)
as
select
  a.id as articulo_id,
  a.codigo_erp,
  a.nombre as articulo,
  fa.nombre as familia,
  sum(fl.cantidad) as unidades_vendidas,
  sum(fl.base_imponible) as importe_vendido,
  sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0)) as coste_total,
  sum(fl.base_imponible) - sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0)) as margen_total,
  case when sum(fl.base_imponible) > 0 then
    round(100 * (sum(fl.base_imponible) - sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0))) / sum(fl.base_imponible), 2)
  else null end as margen_pct
from public.factura_lineas fl
join public.articulos a on a.id = fl.articulo_id
left join public.familias_articulo fa on fa.id = a.familia_id
group by a.id, a.codigo_erp, a.nombre, fa.nombre;
