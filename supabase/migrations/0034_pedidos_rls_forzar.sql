-- Forzar RLS correcto para pedidos (evita quedar con política vieja)
alter table public.pedidos enable row level security;
drop policy if exists pedidos_select on public.pedidos;
drop policy if exists pedidos_write on public.pedidos;
create policy pedidos_select on public.pedidos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id = public.auth_comercial_id()
      or cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
    )
  )
);
create policy pedidos_write on public.pedidos for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));
