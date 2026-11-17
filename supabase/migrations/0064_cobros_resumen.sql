-- Resumen de cobros para la página de Crédito y cobro.
--
-- Agrega en SQL para no depender del límite de 1.000 filas de PostgREST
-- (DOT tiene 5.429 vencimientos y FUX 53.383).
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.cobros_resumen(p_codigo_empresa text, p_cliente uuid default null)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with e as (
    select id from public.empresas where codigo = p_codigo_empresa
  ),
  base as (
    select c.cliente_id,
           c.pendiente,
           case when c.fecha_vencimiento is null then 0 else (current_date - c.fecha_vencimiento) end as dias
    from public.cobros_cartera c, e
    where c.empresa_id = e.id
      and c.pendiente <> 0
      and (p_cliente is null or c.cliente_id = p_cliente)
  ),
  agg as (
    select coalesce(sum(pendiente), 0) as saldo,
           coalesce(sum(pendiente) filter (where dias > 0), 0) as vencido,
           coalesce(sum(pendiente) filter (where dias > 90), 0) as vencido90,
           coalesce(sum(pendiente) filter (where dias <= 0), 0) as futuro,
           coalesce(sum(pendiente) filter (where dias <= 0), 0) as corriente,
           coalesce(sum(pendiente) filter (where dias between 1 and 30), 0) as d1_30,
           coalesce(sum(pendiente) filter (where dias between 31 and 60), 0) as d31_60,
           coalesce(sum(pendiente) filter (where dias between 61 and 90), 0) as d61_90,
           coalesce(sum(pendiente) filter (where dias > 90), 0) as d90
    from base
  ),
  porc as (
    select cliente_id,
           sum(pendiente) as saldo,
           coalesce(sum(pendiente) filter (where dias > 0), 0) as vencido
    from base
    where cliente_id is not null
    group by cliente_id
  )
  select jsonb_build_object(
    'saldo', (select saldo from agg),
    'vencido', (select vencido from agg),
    'vencido90', (select vencido90 from agg),
    'futuro', (select futuro from agg),
    'buckets', jsonb_build_object(
      'corriente', (select corriente from agg),
      'd1_30', (select d1_30 from agg),
      'd31_60', (select d31_60 from agg),
      'd61_90', (select d61_90 from agg),
      'd90', (select d90 from agg)
    ),
    'por_cliente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente_id', cliente_id, 'saldo', saldo, 'vencido', vencido
      ))
      from porc
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.cobros_resumen(text, uuid) from public, anon;
grant execute on function public.cobros_resumen(text, uuid) to authenticated;
