-- Programación de campañas, plantillas reutilizables y autoría.
alter table public.campanas_email add column if not exists programada_para timestamptz;

alter table public.plantillas_email add column if not exists creado_por uuid references public.profiles(id) on delete set null default auth.uid();

drop policy if exists plantillas_email_all on public.plantillas_email;
create policy plantillas_email_all on public.plantillas_email for all using (
  public.auth_role() in ('admin','direccion','comercial')
) with check (
  public.auth_role() in ('admin','direccion','comercial')
);

create index if not exists idx_campanas_programadas on public.campanas_email(programada_para)
  where estado = 'programada';
