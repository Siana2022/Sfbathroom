-- El comercial puede crear y lanzar campañas, pero solo las suyas y a su cartera.
alter table public.campanas_email add column if not exists creado_por uuid references public.profiles(id) on delete set null default auth.uid();
create index if not exists idx_campanas_creado_por on public.campanas_email(creado_por);

drop policy if exists campanas_email_all on public.campanas_email;
create policy campanas_email_all on public.campanas_email for all using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and creado_por = auth.uid())
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and creado_por = auth.uid())
);

drop policy if exists campana_envios_select on public.campana_envios;
create policy campana_envios_select on public.campana_envios for select using (
  public.auth_role() in ('admin','direccion')
  or exists (
    select 1 from public.campanas_email c
    where c.id = campana_envios.campana_id and c.creado_por = auth.uid()
  )
);

drop policy if exists plantillas_email_all on public.plantillas_email;
create policy plantillas_email_all on public.plantillas_email for all using (
  public.auth_role() in ('admin','direccion','comercial')
) with check (
  public.auth_role() in ('admin','direccion','comercial')
);
