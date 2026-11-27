-- Notas de cobro importadas de A3ERP (`EfectosClientes.OBSERVACIONES`).
--
-- Tabla aparte a propósito: son anotaciones de cobros/efectos y NO deben verlas los
-- comerciales. La RLS lo garantiza: solo administración, dirección, financiero y
-- administración de cobros pueden leerlas.
--
-- Idempotente.

create table if not exists public.cobros_notas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  fecha date,
  documento text,
  importe numeric(14,2),
  texto text not null,
  origen text not null default 'a3erp',
  id_externo text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_cobros_notas_origen_externo
  on public.cobros_notas (origen, id_externo);
create index if not exists idx_cobros_notas_cliente on public.cobros_notas (cliente_id, fecha desc);

alter table public.cobros_notas enable row level security;

-- Solo perfiles de cobros/finanzas. El comercial no la ve ni por API.
drop policy if exists cobros_notas_select on public.cobros_notas;
create policy cobros_notas_select on public.cobros_notas for select using (
  public.auth_role() in ('admin', 'direccion', 'financiero', 'administracion')
);

drop policy if exists cobros_notas_insert on public.cobros_notas;
create policy cobros_notas_insert on public.cobros_notas for insert with check (
  public.auth_role() in ('admin', 'direccion')
);

drop policy if exists cobros_notas_update on public.cobros_notas;
create policy cobros_notas_update on public.cobros_notas for update using (
  public.auth_role() in ('admin', 'direccion')
) with check (
  public.auth_role() in ('admin', 'direccion')
);

drop policy if exists cobros_notas_delete on public.cobros_notas;
create policy cobros_notas_delete on public.cobros_notas for delete using (
  public.auth_role() in ('admin', 'direccion')
);

grant select on public.cobros_notas to authenticated;
