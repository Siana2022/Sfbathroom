-- Eventos de las campañas de email (aperturas, clics, rebotes y quejas).
create table if not exists public.campana_eventos (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid references public.campanas_email(id) on delete cascade,
  email text,
  tipo text not null check (tipo in ('apertura','clic','rebote','queja','entrega')),
  url text,
  evento_id text unique,
  fecha timestamptz not null default now()
);
create index if not exists idx_campana_eventos_campana on public.campana_eventos(campana_id, tipo);

alter table public.campana_eventos enable row level security;
drop policy if exists campana_eventos_select on public.campana_eventos;
create policy campana_eventos_select on public.campana_eventos for select using (
  public.auth_role() in ('admin','direccion')
  or exists (
    select 1 from public.campanas_email c
    where c.id = campana_eventos.campana_id and c.creado_por = auth.uid()
  )
);
