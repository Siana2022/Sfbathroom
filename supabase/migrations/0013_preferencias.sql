-- Migración 0013: Preferencias por usuario
-- JSONB flexible, RLS solo propietario. Patrón igual a kpis_personalizados.

create table if not exists public.preferencias_usuario (
  usuario_id uuid primary key references auth.users(id),
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.preferencias_usuario enable row level security;

create policy pref_propias on public.preferencias_usuario
  for all using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

grant select, update, insert on public.preferencias_usuario to authenticated;