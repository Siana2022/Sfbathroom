-- Migración 0014: Notificaciones in-app
-- Solo propietario puede ver/modificar las suyas. El server (service_role)
-- escribe con usuario_id del destinatario.

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  empresa_id uuid references public.empresas(id),
  tipo text not null check (tipo in ('alerta','resumen','informe','sistema')),
  titulo text not null,
  mensaje text,
  enlace text,
  leida boolean not null default false,
  fecha timestamptz not null default now()
);

create index if not exists idx_notif_usuario_leida on public.notificaciones (usuario_id, leida, fecha desc);

alter table public.notificaciones enable row level security;

create policy notif_propias_select on public.notificaciones
  for select using (usuario_id = auth.uid());

create policy notif_propias_update on public.notificaciones
  for update using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());