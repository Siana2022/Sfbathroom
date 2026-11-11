-- 0042_perf_ventas_filtrado_rpc.sql
-- Rendimiento (P-mult, paso 6). Arregla la lentitud de la pestaña de Facturación al aplicar un
-- filtro (cliente/comercial/familia/marca): hasta ahora, con filtros, la app abandonaba el
-- cálculo rápido y caía al camino antiguo (descargar facturas+líneas de 1-2 años y filtrar en
-- Node), lo que tardaba 10-15 s.
--
-- Este RPC devuelve, EN UNA sola llamada, las facturas que cumplen el filtro + todas sus líneas,
-- aplicando el filtro en SQL (incluido familia/marca por existencia de línea). Respeta la cartera
-- del rol (auth_role()/auth_comercial_id()). La agregación sigue haciéndose en Node en cada módulo
-- (mismos números); esto solo cambia la FUENTE de los datos filtrados.
--
-- Semántica idéntica a getFacturaIdsFiltradas (lib/datos/filtros.ts):
--   * cliente  -> facturas.cliente_id = p_cliente
--   * comercial-> facturas.comercial_id = p_comercial
--   * familia  -> la factura tiene AL MENOS una línea de un artículo de esa familia
--   * marca    -> idem con articulos.marca_id
--   * ventana  -> [p_desde, p_hasta] (el llamador pasa la ventana efectiva, ya con desde/hasta).

create or replace function public.ventas_filtrado(
  p_codigo_empresa text,
  p_desde date,
  p_hasta date,
  p_cliente uuid default null,
  p_comercial uuid default null,
  p_familia text default null,
  p_marca uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_facturas jsonb;
  v_lineas jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  create temporary table tmp_fact_filtrado on commit drop as
  select f.id, f.cliente_id, f.comercial_id, f.fecha, f.tipo_documento, f.base_imponible, f.total
  from public.facturas f
  where f.empresa_id = v_empresa
    and f.fecha >= p_desde and f.fecha <= p_hasta
    and (v_puede_todo or f.comercial_id = v_com)
    and (p_cliente is null or f.cliente_id = p_cliente)
    and (p_comercial is null or f.comercial_id = p_comercial)
    and (
      (p_familia is null and p_marca is null)
      or exists (
        select 1
        from public.factura_lineas fl
        join public.articulos a on a.id = fl.articulo_id
        where fl.factura_id = f.id
          and (p_familia is null or a.familia = p_familia)
          and (p_marca is null or a.marca_id = p_marca)
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'cliente_id', cliente_id,
           'comercial_id', comercial_id,
           'fecha', fecha,
           'tipo_documento', tipo_documento,
           'base_imponible', base_imponible,
           'total', total
         )), '[]'::jsonb)
  into v_facturas
  from tmp_fact_filtrado;

  select coalesce(jsonb_agg(jsonb_build_object(
           'factura_id', fl.factura_id,
           'articulo_id', fl.articulo_id,
           'cantidad', fl.cantidad,
           'precio_unitario', fl.precio_unitario,
           'base_imponible', fl.base_imponible,
           'importe', fl.importe,
           'coste_unitario', fl.coste_unitario
         )), '[]'::jsonb)
  into v_lineas
  from public.factura_lineas fl
  join tmp_fact_filtrado t on t.id = fl.factura_id;

  return jsonb_build_object('facturas', v_facturas, 'lineas', v_lineas);
end;
$$;

comment on function public.ventas_filtrado(text, date, date, uuid, uuid, text, uuid) is
  'Facturas que cumplen el filtro (cliente/comercial/familia/marca) en [desde,hasta] + sus líneas, '
  'en una sola llamada, respetando la cartera del rol. Acelera la ruta con filtros de Facturación.';

revoke execute on function public.ventas_filtrado(text, date, date, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.ventas_filtrado(text, date, date, uuid, uuid, text, uuid) to authenticated;
