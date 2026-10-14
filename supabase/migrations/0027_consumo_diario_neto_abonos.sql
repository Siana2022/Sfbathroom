-- 0027_consumo_diario_neto_abonos.sql
-- v_consumo_diario (0003) filtraba tipo_documento = 'factura', así que el consumo (cobertura
-- de stock) y las "unidades vendidas" (rotación) salían BRUTOS. Las unidades NETAS incluyen
-- facturas + notas de cargo − abonos; como las líneas de abono ya llevan cantidad NEGATIVA,
-- basta con incluir los tipos de la neta. Mismo criterio que v_perf_facturacion_mensual (0026)
-- y lib/datos/margen.ts. security_invoker se mantiene.

create or replace view public.v_consumo_diario
with (security_invoker = true) as
select f.empresa_id, fl.articulo_id, f.fecha, sum(fl.cantidad) as unidades
from public.factura_lineas fl
join public.facturas f on f.id = fl.factura_id
where f.tipo_documento in ('factura', 'abono', 'nota_cargo')
group by f.empresa_id, fl.articulo_id, f.fecha;
