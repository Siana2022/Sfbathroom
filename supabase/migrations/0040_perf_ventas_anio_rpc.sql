-- 0040_perf_ventas_anio_rpc.sql
-- Rendimiento multiempresa (P-mult, paso 4). Acelera la navegación entre secciones.
--
-- Problema: los módulos de lib/datos/* (margen, concentracion, clientes, actividad, etc.)
-- descargan las líneas de un año con `lineasPorFacturas`, que trocea el `.in(factura_id,...)`
-- en lotes y pagina de 1000 en 1000 → DECENAS de peticiones HTTP SECUENCIALES a PostgREST
-- por página. Eso (no la CPU) es el grueso de los 4-5 s al cambiar de sección. El volumen por
-- año está acotado (~5.000 facturas/año), así que el cuello es el número de round-trips, no el
-- tamaño del dato.
--
-- Solución: un RPC que devuelve facturas + líneas del año en UNA sola llamada, filtrando por
-- empresa+cartera en SQL. Los módulos mantienen su agregación en Node idéntica (mismos números)
-- pero con 1 round-trip en vez de ~30-40. Reutilizable por todas las secciones de venta.
--
-- RLS / cartera: SECURITY DEFINER pero replica el filtro de la RLS de `facturas`
-- (auth_role()/auth_comercial_id()), igual que 0038/0039. Un rol 'comercial' solo ve su cartera.

create or replace function public.ventas_anio(p_codigo_empresa text, p_anio integer)
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
  v_desde date := make_date(p_anio, 1, 1);
  v_hasta date := make_date(p_anio, 12, 31);
  v_facturas jsonb;
  v_lineas jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id,
           'cliente_id', f.cliente_id,
           'comercial_id', f.comercial_id,
           'fecha', f.fecha,
           'tipo_documento', f.tipo_documento,
           'base_imponible', f.base_imponible,
           'total', f.total
         )), '[]'::jsonb)
  into v_facturas
  from public.facturas f
  where f.empresa_id = v_empresa
    and f.fecha >= v_desde and f.fecha <= v_hasta
    and (v_puede_todo or f.comercial_id = v_com);

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
  join public.facturas f on f.id = fl.factura_id
  where f.empresa_id = v_empresa
    and f.fecha >= v_desde and f.fecha <= v_hasta
    and (v_puede_todo or f.comercial_id = v_com);

  return jsonb_build_object('facturas', v_facturas, 'lineas', v_lineas);
end;
$$;

comment on function public.ventas_anio(text, integer) is
  'Devuelve {facturas, lineas} de una empresa y año en una sola llamada, respetando la cartera '
  'del rol (auth_role()/auth_comercial_id()). Sustituye las decenas de round-trips de '
  'lineasPorFacturas/todasLasFilas en los módulos de lib/datos/*. La agregación sigue en Node.';

revoke execute on function public.ventas_anio(text, integer) from public, anon;
grant execute on function public.ventas_anio(text, integer) to authenticated;
