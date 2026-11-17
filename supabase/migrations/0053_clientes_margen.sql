-- Coste de venta por cliente, con la misma lógica que /margen.
--
-- coste_linea = cantidad × coste unitario, donde el coste unitario es:
--   1. el de la línea (factura_lineas.coste_unitario) si no es 0,
--   2. si no, el coste completo medio por lote del artículo,
--   3. si no, el coste del artículo (coste_unitario o precio_coste).
--
-- Respeta la cartera del rol igual que ventas_anio / clientes_actividad.
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.clientes_margen(p_codigo_empresa text, p_anio integer)
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
  v_res jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen');

  with costes as (
    select l.articulo_id,
           sum(coalesce(l.coste_completo_unitario, 0) * coalesce(l.cantidad, 0)) as suma,
           sum(coalesce(l.cantidad, 0)) as qty
    from public.v_coste_completo_por_lote l
    where l.empresa_id = v_empresa
    group by l.articulo_id
  ),
  base as (
    select f.cliente_id,
           coalesce(fl.cantidad, 0) * coalesce(
             nullif(fl.coste_unitario, 0),
             case when c.qty > 0 then c.suma / c.qty end,
             a.coste_unitario,
             a.precio_coste,
             0
           ) as coste
    from public.facturas f
    join public.factura_lineas fl on fl.factura_id = f.id
    left join public.articulos a on a.id = fl.articulo_id
    left join costes c on c.articulo_id = fl.articulo_id
    where f.empresa_id = v_empresa
      and f.cliente_id is not null
      and f.fecha between v_desde and v_hasta
      and f.tipo_documento in ('factura', 'nota_cargo', 'abono')
      and (v_puede_todo or f.comercial_id = v_com)
  ),
  agg as (
    select cliente_id, sum(coste) as coste
    from base
    group by cliente_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', a.cliente_id,
           'coste', a.coste
         )), '[]'::jsonb)
  into v_res
  from agg a;

  return v_res;
end;
$$;

revoke execute on function public.clientes_margen(text, integer) from public, anon;
grant execute on function public.clientes_margen(text, integer) to authenticated;
