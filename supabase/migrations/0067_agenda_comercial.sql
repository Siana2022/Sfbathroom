-- Agenda del comercial: visitas, llamadas y tareas ligadas a su cartera.
-- Idempotente. Se aplica en Supabase SQL Editor.

create table if not exists public.agenda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  comercial_id uuid not null references public.comerciales(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  fecha date not null,
  hora time,
  titulo text not null,
  notas text,
  completada boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_agenda_empresa_fecha on public.agenda(empresa_id, fecha);
create index if not exists idx_agenda_comercial on public.agenda(comercial_id, fecha);

alter table public.agenda enable row level security;

drop policy if exists agenda_select on public.agenda;
create policy agenda_select on public.agenda for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);

drop policy if exists agenda_insert on public.agenda;
create policy agenda_insert on public.agenda for insert with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);

drop policy if exists agenda_update on public.agenda;
create policy agenda_update on public.agenda for update using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);

drop policy if exists agenda_delete on public.agenda;
create policy agenda_delete on public.agenda for delete using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);
