-- Observaciones sobre un pedido (por qué se retrasa, incidencia, etc.).
--
-- Se guarda histórico (una fila por anotación) para poder analizar después.
-- Idempotente.

create table if not exists public.pedidos_observaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  texto text not null,
  autor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_pedidos_obs_pedido on public.pedidos_observaciones (pedido_id, created_at desc);

alter table public.pedidos_observaciones enable row level security;

drop policy if exists pedidos_obs_select on public.pedidos_observaciones;
create policy pedidos_obs_select on public.pedidos_observaciones for select using (
  public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen')
  or exists (
    select 1 from public.pedidos p
    where p.id = pedidos_observaciones.pedido_id and public.es_mi_comercial(p.comercial_id)
  )
);

drop policy if exists pedidos_obs_insert on public.pedidos_observaciones;
create policy pedidos_obs_insert on public.pedidos_observaciones for insert with check (
  public.auth_role() in ('admin', 'direccion', 'administracion', 'almacen')
  or exists (
    select 1 from public.pedidos p
    where p.id = pedidos_observaciones.pedido_id and public.es_mi_comercial(p.comercial_id)
  )
);

drop policy if exists pedidos_obs_delete on public.pedidos_observaciones;
create policy pedidos_obs_delete on public.pedidos_observaciones for delete using (
  public.auth_role() in ('admin', 'direccion')
);

grant select, insert on public.pedidos_observaciones to authenticated;
