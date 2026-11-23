-- Agenda v2: asunto, tipo de reunión, cliente obligatorio y notas de seguimiento.
-- Idempotente. Se aplica en Supabase SQL Editor.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agenda' and column_name = 'titulo'
  ) then
    alter table public.agenda rename column titulo to asunto;
  end if;
end $$;

alter table public.agenda add column if not exists tipo text not null default 'presencial';

alter table public.agenda drop constraint if exists agenda_tipo_check;
alter table public.agenda add constraint agenda_tipo_check
  check (tipo in ('online', 'telefonica', 'presencial', 'email'));

create table if not exists public.agenda_notas (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid not null references public.agenda(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  comercial_id uuid references public.comerciales(id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agenda_notas_agenda on public.agenda_notas(agenda_id);

alter table public.agenda_notas enable row level security;

drop policy if exists agenda_notas_select on public.agenda_notas;
create policy agenda_notas_select on public.agenda_notas for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);

drop policy if exists agenda_notas_insert on public.agenda_notas;
create policy agenda_notas_insert on public.agenda_notas for insert with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);

drop policy if exists agenda_notas_delete on public.agenda_notas;
create policy agenda_notas_delete on public.agenda_notas for delete using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);
