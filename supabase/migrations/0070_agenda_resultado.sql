-- Resultado de la reunión: estado, importe, pedido, motivo y próxima reunión.
-- Idempotente. Se aplica en Supabase SQL Editor.

alter table public.agenda add column if not exists estado text not null default 'programada';
alter table public.agenda drop constraint if exists agenda_estado_check;
alter table public.agenda add constraint agenda_estado_check
  check (estado in ('programada', 'realizada', 'ganada', 'perdida', 'cancelada'));

alter table public.agenda add column if not exists importe_estimado numeric(14,2);
alter table public.agenda add column if not exists pedido_ref text;
alter table public.agenda add column if not exists motivo_cierre text;
alter table public.agenda add column if not exists proxima_reunion_id uuid references public.agenda(id) on delete set null;

alter table public.agenda_notas drop constraint if exists agenda_notas_tipo_check;
alter table public.agenda_notas add constraint agenda_notas_tipo_check
  check (tipo in ('pedido_solicitado', 'reunion_seguimiento', 'otros', 'sistema'));
