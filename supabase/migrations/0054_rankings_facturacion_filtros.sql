-- Rankings de Facturación: ahora los filtros se aplican a TODAS las secciones
-- (top de referencias, top de clientes y comerciales por facturación).
--
-- Antes, top_clientes y comerciales ignoraban los filtros por diseño. A petición
-- del cliente, si se filtra por cliente/comercial/familia/marca, los tres
-- rankings deben responder al mismo filtro.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.perf_rankings_facturacion(
  p_codigo_empresa text,
  p_anio integer,
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
  v_prev integer := p_anio - 1;
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_desde date := make_date(p_anio, 1, 1);
  v_hasta date := make_date(p_anio, 12, 31);
  v_desde_prev date := make_date(v_prev, 1, 1);
  v_hasta_prev date := make_date(v_prev, 12, 31);
  v_top_ref jsonb;
  v_top_cli jsonb;
  v_comerciales jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  -- TOP 10 referencias (respeta filtros), por unidades.
  with lin as (
    select fl.articulo_id, fl.cantidad, fl.base_imponible
    from public.factura_lineas fl
    join public.facturas f on f.id = fl.factura_id
    left join public.articulos a on a.id = fl.articulo_id
    where f.empresa_id = v_empresa
      and f.fecha >= v_desde and f.fecha <= v_hasta
      and (v_puede_todo or f.comercial_id = v_com)
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (p_familia is null or a.familia = p_familia)
      and (p_marca is null or a.marca_id = p_marca)
      and fl.articulo_id is not null
  ),
  ref as (
    select articulo_id, sum(cantidad) as unidades, sum(coalesce(base_imponible, 0)) as neta
    from lin
    group by articulo_id
    order by sum(cantidad) desc nulls last
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'articulo', coalesce(ar.nombre, '—'),
           'codigo', ar.codigo_erp,
           'unidades', ref.unidades,
           'neta', ref.neta
         ) order by ref.unidades desc nulls last), '[]'::jsonb)
  into v_top_ref
  from ref
  left join public.articulos ar on ar.id = ref.articulo_id;

  -- TOP 20 clientes (ahora también con filtros).
  with fcur as (
    select f.id, f.cliente_id, f.base_imponible
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde and f.fecha <= v_hasta
      and (v_puede_todo or f.comercial_id = v_com) and f.cliente_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or a.marca_id = p_marca)
        )
      )
  ),
  ncur as (select cliente_id, sum(base_imponible) as neta from fcur group by cliente_id),
  ucur as (
    select fc.cliente_id, coalesce(sum(fl.cantidad), 0) as unidades
    from fcur fc join public.factura_lineas fl on fl.factura_id = fc.id
    group by fc.cliente_id
  ),
  nprev as (
    select f.cliente_id, sum(f.base_imponible) as neta_prev
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde_prev and f.fecha <= v_hasta_prev
      and (v_puede_todo or f.comercial_id = v_com) and f.cliente_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or a.marca_id = p_marca)
        )
      )
    group by f.cliente_id
  ),
  top as (
    select ncur.cliente_id, ncur.neta,
           coalesce(ucur.unidades, 0) as unidades,
           coalesce(nprev.neta_prev, 0) as neta_prev
    from ncur
    left join ucur on ucur.cliente_id = ncur.cliente_id
    left join nprev on nprev.cliente_id = ncur.cliente_id
    order by ncur.neta desc nulls last
    limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente', coalesce(c.nombre, '—'),
           'neta', top.neta,
           'unidades', top.unidades,
           'comercial', coalesce(co.nombre, '—'),
           'neta_prev', top.neta_prev
         ) order by top.neta desc nulls last), '[]'::jsonb)
  into v_top_cli
  from top
  left join public.clientes c on c.id = top.cliente_id
  left join public.comerciales co on co.id = c.comercial_id;

  -- Comerciales por facturación (ahora también con filtros).
  with fcur as (
    select f.id, f.comercial_id, f.base_imponible
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde and f.fecha <= v_hasta
      and (v_puede_todo or f.comercial_id = v_com) and f.comercial_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or a.marca_id = p_marca)
        )
      )
  ),
  icur as (select comercial_id, sum(base_imponible) as importe from fcur group by comercial_id),
  ucur as (
    select fc.comercial_id, coalesce(sum(fl.cantidad), 0) as unidades
    from fcur fc join public.factura_lineas fl on fl.factura_id = fc.id
    group by fc.comercial_id
  ),
  iprev as (
    select f.comercial_id, sum(f.base_imponible) as importe_prev
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde_prev and f.fecha <= v_hasta_prev
      and (v_puede_todo or f.comercial_id = v_com) and f.comercial_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or a.marca_id = p_marca)
        )
      )
    group by f.comercial_id
  ),
  coms as (
    select icur.comercial_id, icur.importe,
           coalesce(ucur.unidades, 0) as unidades,
           coalesce(iprev.importe_prev, 0) as importe_prev
    from icur
    left join ucur on ucur.comercial_id = icur.comercial_id
    left join iprev on iprev.comercial_id = icur.comercial_id
    order by icur.importe desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'comercial', coalesce(co.nombre, '—'),
           'anio', p_anio,
           'importe', coms.importe,
           'unidades', coms.unidades,
           'importe_prev', coms.importe_prev
         ) order by coms.importe desc nulls last), '[]'::jsonb)
  into v_comerciales
  from coms
  left join public.comerciales co on co.id = coms.comercial_id;

  return jsonb_build_object(
    'top_referencias', v_top_ref,
    'top_clientes', v_top_cli,
    'comerciales', v_comerciales
  );
end;
$$;

comment on function public.perf_rankings_facturacion(text, integer, uuid, uuid, text, uuid) is
  'Rankings de la pestaña Facturación: TOP 10 referencias, TOP 20 clientes y comerciales, todos '
  'respetando los filtros activos y la cartera del rol.';

revoke execute on function public.perf_rankings_facturacion(text, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.perf_rankings_facturacion(text, integer, uuid, uuid, text, uuid) to authenticated;
