-- Actividad y margen por cliente: aceptan los filtros de la página.
--
-- Igual que en los rankings de Facturación, si el usuario filtra por cliente,
-- comercial, familia o marca, los KPIs de Comportamiento de cliente deben
-- responder al mismo filtro.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.clientes_actividad(
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
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_desde date := make_date(p_anio, 1, 1);
  v_hasta date := make_date(p_anio, 12, 31);
  v_prev_desde date := make_date(p_anio - 1, 1, 1);
  v_prev_hasta date := make_date(p_anio - 1, 12, 31);
  v_res jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen');

  with base as (
    select f.cliente_id,
           f.fecha,
           case
             when f.tipo_documento = 'abono' then -abs(coalesce(f.base_imponible, f.total, 0))
             else abs(coalesce(f.base_imponible, f.total, 0))
           end as neta
    from public.facturas f
    where f.empresa_id = v_empresa
      and f.cliente_id is not null
      and f.tipo_documento in ('factura', 'abono', 'nota_cargo')
      and (v_puede_todo or f.comercial_id = v_com)
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
  agg as (
    select cliente_id,
           min(fecha) as primera,
           max(fecha) as ultima,
           count(*) filter (where fecha between v_desde and v_hasta) as fac_anio,
           coalesce(sum(neta) filter (where fecha between v_desde and v_hasta), 0) as neta_anio,
           count(*) filter (where fecha between v_prev_desde and v_prev_hasta) as fac_prev,
           coalesce(sum(neta) filter (where fecha between v_prev_desde and v_prev_hasta), 0) as neta_prev,
           count(*) filter (where fecha >= current_date - 365) as fac_12m,
           coalesce(sum(neta) filter (where fecha >= current_date - 365), 0) as neta_12m
    from base
    group by cliente_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', a.cliente_id,
           'primera', a.primera,
           'ultima', a.ultima,
           'facturasAnio', a.fac_anio,
           'netaAnio', a.neta_anio,
           'facturasPrev', a.fac_prev,
           'netaPrev', a.neta_prev,
           'facturas12m', a.fac_12m,
           'neta12m', a.neta_12m
         )), '[]'::jsonb)
  into v_res
  from agg a;

  return v_res;
end;
$$;

revoke execute on function public.clientes_actividad(text, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.clientes_actividad(text, integer, uuid, uuid, text, uuid) to authenticated;

create or replace function public.clientes_margen(
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
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (p_familia is null or a.familia = p_familia)
      and (p_marca is null or a.marca_id = p_marca)
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

revoke execute on function public.clientes_margen(text, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.clientes_margen(text, integer, uuid, uuid, text, uuid) to authenticated;
