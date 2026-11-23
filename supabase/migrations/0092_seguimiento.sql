-- Seguimiento del cliente: notas internas, avisos propios, historial de cambios
-- de fecha de reuniones y plantillas de reunión.

create table if not exists public.clientes_notas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  comercial_id uuid references public.comerciales(id) on delete set null,
  autor_id uuid references public.profiles(id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_clientes_notas_cliente on public.clientes_notas(cliente_id, created_at desc);

create table if not exists public.clientes_alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  comercial_id uuid references public.comerciales(id) on delete set null,
  titulo text not null,
  nota text,
  recordar_hasta date,
  resuelta boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_clientes_alertas_cliente on public.clientes_alertas(cliente_id, resuelta);

create table if not exists public.agenda_cambios (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid not null references public.agenda(id) on delete cascade,
  fecha_anterior date,
  hora_anterior time,
  fecha_nueva date,
  hora_nueva time,
  motivo text,
  autor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_agenda_cambios_agenda on public.agenda_cambios(agenda_id, created_at desc);

create table if not exists public.reunion_plantillas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  puntos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.clientes_notas enable row level security;
alter table public.clientes_alertas enable row level security;
alter table public.agenda_cambios enable row level security;
alter table public.reunion_plantillas enable row level security;

drop policy if exists clientes_notas_all on public.clientes_notas;
create policy clientes_notas_all on public.clientes_notas for all using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c where c.id = clientes_notas.cliente_id and public.es_mi_comercial(c.comercial_id)
  ))
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c where c.id = clientes_notas.cliente_id and public.es_mi_comercial(c.comercial_id)
  ))
);

drop policy if exists clientes_alertas_all on public.clientes_alertas;
create policy clientes_alertas_all on public.clientes_alertas for all using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c where c.id = clientes_alertas.cliente_id and public.es_mi_comercial(c.comercial_id)
  ))
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c where c.id = clientes_alertas.cliente_id and public.es_mi_comercial(c.comercial_id)
  ))
);

drop policy if exists agenda_cambios_select on public.agenda_cambios;
create policy agenda_cambios_select on public.agenda_cambios for select using (
  exists (
    select 1 from public.agenda a where a.id = agenda_cambios.agenda_id
      and (
        public.auth_role() in ('admin','direccion','financiero','lectura')
        or (public.auth_role() = 'comercial' and public.es_mi_comercial(a.comercial_id))
      )
  )
);
drop policy if exists agenda_cambios_insert on public.agenda_cambios;
create policy agenda_cambios_insert on public.agenda_cambios for insert with check (
  exists (
    select 1 from public.agenda a where a.id = agenda_cambios.agenda_id
      and (
        public.auth_role() in ('admin','direccion')
        or (public.auth_role() = 'comercial' and public.es_mi_comercial(a.comercial_id))
      )
  )
);

drop policy if exists reunion_plantillas_all on public.reunion_plantillas;
create policy reunion_plantillas_all on public.reunion_plantillas for all using (
  public.auth_role() in ('admin','direccion','comercial')
) with check (
  public.auth_role() in ('admin','direccion','comercial')
);
