-- Migración 0016: Alertas accionables (flujo de trabajo)
-- Estado + asignación sobre alertas_generadas. Escribe: admin/dirección (RLS 0003).

alter table public.alertas_generadas add column if not exists estado text not null default 'nueva'
  check (estado in ('nueva','revisada','pospuesta','descartada'));
alter table public.alertas_generadas add column if not exists asignada_a uuid references auth.users(id);
alter table public.alertas_generadas add column if not exists fecha_estado timestamptz;

create index if not exists idx_alertas_estado on public.alertas_generadas(estado);