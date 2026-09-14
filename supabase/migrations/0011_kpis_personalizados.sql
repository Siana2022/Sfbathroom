-- Migración 0011: Constructor de KPIs personalizados
-- Tabla + RLS. Aplicar en Supabase SQL Editor.

create table if not exists public.kpis_personalizados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nombre text not null,
  metrica text not null,
  calculo text not null default 'suma',
  filtros jsonb not null default '{}'::jsonb,
  objetivo numeric,
  objetivo_op text default 'gte' check (objetivo_op in ('gte','lte')),
  formato text not null default 'numero' check (formato in ('euro','pct','numero','dias')),
  visible_para text not null default 'direccion' check (visible_para in ('todos','direccion','propietario')),
  propietario uuid references auth.users(id) default auth.uid(),
  orden int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.kpis_personalizados enable row level security;

create policy kpis_pers_select on public.kpis_personalizados
  for select using (
    visible_para = 'todos'
    or (visible_para = 'direccion' and public.auth_role() in ('admin','direccion','financiero'))
    or (visible_para = 'propietario' and propietario = auth.uid())
  );

create policy kpis_pers_insert on public.kpis_personalizados
  for insert with check (public.auth_role() in ('admin','direccion'));

create policy kpis_pers_update on public.kpis_personalizados
  for update using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy kpis_pers_delete on public.kpis_personalizados
  for delete using (public.auth_role() in ('admin','direccion'));
