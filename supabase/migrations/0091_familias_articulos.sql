-- Lista de familias de artículo sin traer toda la tabla.
create or replace function public.familias_articulos(p_codigo_empresa text)
returns table (familia text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct a.familia
  from public.articulos a
  join public.empresas e on e.id = a.empresa_id
  where e.codigo = p_codigo_empresa and a.familia is not null
  order by 1;
$$;

grant execute on function public.familias_articulos(text) to authenticated;
