-- Motivos que anota el comercial cuando un cliente deja de comprar.
--
-- Se guarda histórico (una fila por anotación) para poder sacar conclusiones después:
-- cuántos cierran, cuántos se van a otro proveedor, etc.
--
-- Idempotente.

create table if not exists public.clientes_motivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  motivo text not null,
  nota text,
  autor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_clientes_motivos_cliente on public.clientes_motivos (cliente_id, created_at desc);

alter table public.clientes_motivos enable row level security;

drop policy if exists clientes_motivos_select on public.clientes_motivos;
create policy clientes_motivos_select on public.clientes_motivos for select using (
  public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura')
  or exists (
    select 1 from public.clientes c
    where c.id = clientes_motivos.cliente_id and public.es_mi_comercial(c.comercial_id)
  )
);

drop policy if exists clientes_motivos_insert on public.clientes_motivos;
create policy clientes_motivos_insert on public.clientes_motivos for insert with check (
  public.auth_role() in ('admin', 'direccion')
  or exists (
    select 1 from public.clientes c
    where c.id = clientes_motivos.cliente_id and public.es_mi_comercial(c.comercial_id)
  )
);

drop policy if exists clientes_motivos_delete on public.clientes_motivos;
create policy clientes_motivos_delete on public.clientes_motivos for delete using (
  public.auth_role() in ('admin', 'direccion')
);

grant select, insert on public.clientes_motivos to authenticated;
