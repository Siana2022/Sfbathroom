-- ============================================================
-- SFBATHROOM BI · Ingesta A3ERP (0025): limpieza de líneas duplicadas
-- ============================================================
-- Causa raíz (ver config/a3erp.config.json): la consulta de ventas hacía
--   LEFT JOIN ARTICULO a ON a.CODART = l.CODART
-- y CODART NO es único en ARTICULO (varias filas por código), por lo que cada
-- línea del ERP se multiplicaba por el nº de filas de ARTICULO para ese código
-- (fan-out). normalizarRows deduplica el DOCUMENTO (Map por numero_erp) pero no
-- las líneas, así que cada copia entraba como fila distinta en factura_lineas.
--
-- La consulta ya se corrigió (OUTER APPLY ... TOP 1). La reparación AUTORITATIVA
-- es re-ejecutar la ingesta en modo reconciliación (borra y recarga el rango).
-- Esta función es la mitigación inmediata: colapsa filas EXACTAMENTE iguales
-- (mismo factura/artículo/cantidad/precio/coste/descuento/base) conservando una.
--
-- NOTA: si una factura tuviera dos líneas legítimamente idénticas (mismo
-- artículo, cantidad y precio), también se colapsarían. Es poco frecuente; la
-- reconciliación posterior deja el dato exacto.
-- ============================================================

create or replace function a3erp.deduplicar_lineas()
returns integer
language plpgsql
security definer
set search_path = a3erp, public
as $$
declare
  v_borradas integer;
begin
  with duplicadas as (
    select fl.id,
           row_number() over (
             partition by fl.factura_id, fl.articulo_id, fl.cantidad,
                          fl.precio_unitario, coalesce(fl.coste_unitario, -1),
                          fl.descuento_pct, coalesce(fl.base_imponible, -1)
             order by fl.id
           ) as rn
    from public.factura_lineas fl
  )
  delete from public.factura_lineas
  where id in (select id from duplicadas where rn > 1);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

grant execute on function a3erp.deduplicar_lineas() to service_role;
