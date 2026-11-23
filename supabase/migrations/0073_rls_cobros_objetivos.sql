-- Cierra el acceso de los comerciales a datos de toda la empresa:
--   * cobros_cartera: solo vencimientos de sus clientes.
--   * cobros_resumen: agrega solo su cartera.
--   * objetivos_comercial: solo su propio objetivo.
-- Idempotente. Se aplica en Supabase SQL Editor.

drop policy if exists cobros_cartera_select on public.cobros_cartera;
create policy cobros_cartera_select on public.cobros_cartera for select using (
  public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura', 'administracion')
  or (
    public.auth_role() = 'comercial'
    and exists (
      select 1 from public.clientes c
      where c.id = cobros_cartera.cliente_id
        and c.comercial_id = public.auth_comercial_id()
    )
  )
);

drop policy if exists objetivos_comercial_select on public.objetivos_comercial;
create policy objetivos_comercial_select on public.objetivos_comercial for select using (
  public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura')
  or (
    public.auth_role() = 'comercial'
    and comercial_id = public.auth_comercial_id()
  )
);

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
      and (
        public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura', 'administracion')
        or c.cliente_id in (
          select cl.id from public.clientes cl
          where cl.comercial_id = public.auth_comercial_id()
        )
      )
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
