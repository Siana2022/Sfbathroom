-- Comerciales con actividad real (facturas o pedidos en los últimos 24 meses).
--
-- Sirve para que los desplegables de filtro no ofrezcan comerciales de demo o
-- sin datos (Ana Vidal, Marco Rossi, Africa, America, Asia, 77...).
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.comerciales_con_actividad(p_codigo_empresa text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with e as (
    select id from public.empresas where codigo = p_codigo_empresa
  ),
  ids as (
    select distinct f.comercial_id
    from public.facturas f, e
    where f.empresa_id = e.id
      and f.comercial_id is not null
      and f.fecha >= current_date - interval '24 months'
    union
    select distinct p.comercial_id
    from public.pedidos p, e
    where p.empresa_id = e.id
      and p.comercial_id is not null
      and p.fecha >= current_date - interval '24 months'
  )
  select coalesce(jsonb_agg(comercial_id), '[]'::jsonb) from ids;
$$;

revoke execute on function public.comerciales_con_actividad(text) from public, anon;
grant execute on function public.comerciales_con_actividad(text) to authenticated;
