-- Migración 0012: Programador de tareas (cron)
-- Registro de ejecuciones para idempotencia. El cron escribe con service_role
-- (bypassa RLS); los humanos solo pueden leer (admin/dirección).

create table if not exists public.jobs_ejecutados (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  clave text not null,
  estado text not null default 'ok' check (estado in ('ok','error')),
  detalle text,
  ejecutado_at timestamptz not null default now(),
  unique (job, clave)
);

create index if not exists idx_jobs_ejecutados_fecha on public.jobs_ejecutados(ejecutado_at desc);

alter table public.jobs_ejecutados enable row level security;

create policy jobs_admin_select on public.jobs_ejecutados
  for select using (public.auth_role() in ('admin','direccion'));

create policy jobs_ver_frescura on public.jobs_ejecutados
  for select using (auth.role() = 'authenticated');