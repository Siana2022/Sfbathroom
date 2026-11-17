-- La marca STARBATH incluye también al comercial JUAN ORTEGA.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.factura_es_marca(p_factura uuid, p_marca uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with sb as (
    select exists (
      select 1
      from public.facturas f
      join public.comerciales c on c.id = f.comercial_id
      where f.id = p_factura
        and (
          upper(c.nombre) like '%STARBATH%'
          or upper(btrim(c.nombre)) = 'JUAN ORTEGA'
        )
    ) as v
  )
  select case
    when p_marca is null then true
    when (select upper(nombre) from public.marcas where id = p_marca) like '%STARBATH%' then (select v from sb)
    else not (select v from sb)
  end;
$$;

revoke execute on function public.factura_es_marca(uuid, uuid) from public, anon;
grant execute on function public.factura_es_marca(uuid, uuid) to authenticated;
