-- Persona de contacto y permiso del comercial para completar la ficha de sus clientes.
alter table public.clientes add column if not exists persona_contacto text;

drop policy if exists clientes_update_comercial on public.clientes;
create policy clientes_update_comercial on public.clientes for update
  using (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
  with check (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id());
