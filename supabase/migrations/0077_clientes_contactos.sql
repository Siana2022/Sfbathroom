-- Varios contactos por cliente.

create table if not exists public.clientes_contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  cargo text,
  telefono text,
  email text,
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_clientes_contactos_cliente on public.clientes_contactos(cliente_id);

-- Volcar el contacto único que hubiera en la ficha.
insert into public.clientes_contactos (empresa_id, cliente_id, nombre, telefono, email, es_principal)
select c.empresa_id, c.id,
       coalesce(nullif(btrim(c.persona_contacto), ''), 'Contacto principal'),
       nullif(btrim(c.telefono), ''),
       nullif(btrim(c.email), ''),
       true
from public.clientes c
where c.empresa_id is not null
  and (nullif(btrim(c.persona_contacto), '') is not null
       or nullif(btrim(c.telefono), '') is not null
       or nullif(btrim(c.email), '') is not null)
  and not exists (select 1 from public.clientes_contactos x where x.cliente_id = c.id);

alter table public.clientes_contactos enable row level security;

drop policy if exists clientes_contactos_select on public.clientes_contactos;
create policy clientes_contactos_select on public.clientes_contactos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c
    where c.id = clientes_contactos.cliente_id and c.comercial_id = public.auth_comercial_id()
  ))
);

drop policy if exists clientes_contactos_write on public.clientes_contactos;
create policy clientes_contactos_write on public.clientes_contactos for all using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c
    where c.id = clientes_contactos.cliente_id and c.comercial_id = public.auth_comercial_id()
  ))
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c
    where c.id = clientes_contactos.cliente_id and c.comercial_id = public.auth_comercial_id()
  ))
);
