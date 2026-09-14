-- 0008: Log de envíos de alertas por correo (evita duplicados en el cron).
-- Aplicable: pegando en el SQL editor del proyecto dgbxualxhrbbqglvxtxq.
-- Dejarlo anon con RLS SIN política write delegada: solo se inserta desde
-- el cron server-side (service_role) o desde la ruta /api/alertas/enviar.

create table if not exists public.alertas_correos_enviados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  ejercicio integer not null,
  resumen jsonb not null,
  enviado boolean not null,
  razon text,
  created_at timestamptz not null default now()
);

alter table public.alertas_correos_enviados enable row level security;

create index if not exists idx_alertas_correos_ejercicio
  on public.alertas_correos_enviados(empresa_id, ejercicio, created_at);

-- Lectura solo para roles de dirección/financiero/admin, escritura vía
-- service_role (procesos) — esta política no permite insert/update a usuarios.
create policy alertas_correos_enviados_select
  on public.alertas_correos_enviados
  for select using (
    public.auth_role() in ('admin','direccion','financiero')
  );

-- ---------- RPC admin: listar usuarios (la app no tiene service_role) ----------
-- Devuelve perfiles + email de auth.users solo para llamantes con rol admin.
create or replace function public.admin_listar_usuarios()
returns table (id uuid, email text, rol text, comercial_id uuid, created_at timestamptz)
language sql
security definer
set search_path = public, auth
as $$
  select p.id, u.email, p.role, p.comercial_id, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.auth_role() = 'admin'
  order by u.email;
$$;

revoke all on function public.admin_listar_usuarios() from public;
grant execute on function public.admin_listar_usuarios() to authenticated;