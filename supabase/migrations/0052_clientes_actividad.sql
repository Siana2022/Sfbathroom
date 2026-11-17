-- Actividad por cliente: primera/última factura, facturación por ejercicio y 12 meses.
--
-- Sustituye el cálculo en Node (que bajaba dos años de facturas) por una sola
-- llamada agregada. Respeta la cartera del rol igual que ventas_anio.
--
-- Devuelve por cliente:
--   primera, ultima, facturasAnio, netaAnio, facturasPrev, netaPrev, facturas12m, neta12m
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.clientes_actividad(p_codigo_empresa text, p_anio integer)
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

revoke execute on function public.clientes_actividad(text, integer) from public, anon;
grant execute on function public.clientes_actividad(text, integer) to authenticated;
