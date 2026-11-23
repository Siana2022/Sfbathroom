-- Tipo de seguimiento en las notas de agenda.
-- Idempotente. Se aplica en Supabase SQL Editor.

alter table public.agenda_notas add column if not exists tipo text not null default 'reunion_seguimiento';
alter table public.agenda_notas add column if not exists motivo text;

alter table public.agenda_notas drop constraint if exists agenda_notas_tipo_check;
alter table public.agenda_notas add constraint agenda_notas_tipo_check
  check (tipo in ('pedido_solicitado', 'reunion_seguimiento', 'otros'));
