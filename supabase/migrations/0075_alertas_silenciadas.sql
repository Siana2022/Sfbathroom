-- Alertas silenciadas por el comercial.
create table if not exists public.alertas_silenciadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  comercial_id uuid not null references public.comerciales(id) on delete cascade,
  clave text not null,
  created_at timestamptz not null default now(),
  unique (empresa_id, comercial_id, clave)
);

alter table public.alertas_silenciadas enable row level security;

drop policy if exists alertas_silenciadas_select on public.alertas_silenciadas;
create policy alertas_silenciadas_select on public.alertas_silenciadas for select using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);

drop policy if exists alertas_silenciadas_insert on public.alertas_silenciadas;
create policy alertas_silenciadas_insert on public.alertas_silenciadas for insert with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);

drop policy if exists alertas_silenciadas_delete on public.alertas_silenciadas;
create policy alertas_silenciadas_delete on public.alertas_silenciadas for delete using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);
