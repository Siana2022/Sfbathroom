-- Migración 0017: Push subscriptions (PWA, F1.4)
-- Cada usuario gestiona sus propias suscripciones (políticas por fila).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid references public.empresas(id),
  endpoint text not null unique,
  keys_p256dh text not null,
  keys_auth text not null,
  creada_en timestamptz not null default now(),
  ultimo_uso timestamptz
);

alter table public.push_subscriptions enable row level security;

create policy "push_propias_select" on public.push_subscriptions
  for select using (usuario_id = auth.uid());

create policy "push_propias_insert" on public.push_subscriptions
  for insert with check (usuario_id = auth.uid());

create policy "push_propias_delete" on public.push_subscriptions
  for delete using (usuario_id = auth.uid());

create index if not exists idx_push_usuario on public.push_subscriptions(usuario_id);