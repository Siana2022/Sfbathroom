-- Posición del comercial en el ranking del año (solo agregados, sin datos de otros).
create or replace function public.mi_ranking_comercial(p_codigo_empresa text, p_anio integer)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with e as (
    select id from public.empresas where codigo = p_codigo_empresa
  ),
  agg as (
    select f.comercial_id,
           sum(case when f.tipo_documento = 'abono' then -abs(f.base_imponible) else abs(f.base_imponible) end) as neta
    from public.facturas f, e
    where f.empresa_id = e.id
      and f.comercial_id is not null
      and f.fecha >= make_date(p_anio, 1, 1)
      and f.fecha <= make_date(p_anio, 12, 31)
    group by f.comercial_id
  ),
  ranked as (
    select comercial_id, neta,
           row_number() over (order by neta desc) as posicion,
           count(*) over () as total,
           avg(neta) over () as media
    from agg
  )
  select jsonb_build_object(
    'posicion', (select posicion from ranked where comercial_id = public.auth_comercial_id()),
    'total', (select total from ranked limit 1),
    'media', (select media from ranked limit 1)
  );
$$;

revoke execute on function public.mi_ranking_comercial(text, integer) from public, anon;
grant execute on function public.mi_ranking_comercial(text, integer) to authenticated;
