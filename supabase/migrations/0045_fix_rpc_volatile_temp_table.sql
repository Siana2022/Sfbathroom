-- 0045_fix_rpc_volatile_temp_table.sql
-- Arreglo: PostgREST ejecuta las funciones marcadas `stable`/`immutable` en una transacción de
-- SOLO LECTURA, y en ese modo `CREATE TEMPORARY TABLE` falla ("cannot execute CREATE TABLE in a
-- read-only transaction"). Las tres RPC que usan tabla temporal estaban marcadas `stable`, así que:
--   * perf_series_kpis_mensual: fallaba → el gráfico de evolución de los KPIs salía vacío.
--   * ventas_filtrado y perf_variacion: fallaban en silencio y caían al camino antiguo (Node).
--
-- Solución: marcarlas VOLATILE para que PostgREST abra una transacción read-write y la tabla
-- temporal funcione. No cambia su lógica ni resultados; solo el modo de transacción. Son
-- SECURITY DEFINER y siguen respetando la cartera del rol.

alter function public.perf_series_kpis_mensual(text, integer, uuid, uuid, text, uuid) volatile;
alter function public.ventas_filtrado(text, date, date, uuid, uuid, text, uuid) volatile;
alter function public.perf_variacion(text, integer) volatile;
