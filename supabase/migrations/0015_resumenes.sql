-- Migración 0015: Resúmenes ejecutivos (diarios/semanales)
-- Texto generado por IA (con fallback determinista). Un resumen por
-- empresa+ámbito+fecha. Lectura por cualquier autenticado (la app filtra
-- por empresa); el cron escribe con service_role.

create table if not exists public.resumenes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  ambito text not null,
  fecha date not null,
  texto text not null,
  datos jsonb,
  fuente text not null default 'ia' check (fuente in ('ia','plantilla')),
  created_at timestamptz not null default now(),
  unique (empresa_id, ambito, fecha)
);

create index if not exists idx_resumenes_fecha on public.resumenes(fecha desc);

alter table public.resumenes enable row level security;

create policy resumen_select_autenticados on public.resumenes
  for select using (auth.role() = 'authenticated');