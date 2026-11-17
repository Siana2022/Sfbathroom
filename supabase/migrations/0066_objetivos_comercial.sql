-- Objetivos anuales por comercial (editables desde Configuración).

create table if not exists public.objetivos_comercial (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  anio integer not null,
  comercial_id uuid not null references public.comerciales(id) on delete cascade,
  importe numeric(14,2) not null default 0,
  actualizado timestamptz not null default now(),
  unique (empresa_id, anio, comercial_id)
);

create index if not exists idx_objetivos_comercial on public.objetivos_comercial(empresa_id, anio);

alter table public.objetivos_comercial enable row level security;

drop policy if exists objetivos_comercial_select on public.objetivos_comercial;
create policy objetivos_comercial_select on public.objetivos_comercial for select using (auth.role() = 'authenticated');

drop policy if exists objetivos_comercial_write on public.objetivos_comercial;
create policy objetivos_comercial_write on public.objetivos_comercial for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));
