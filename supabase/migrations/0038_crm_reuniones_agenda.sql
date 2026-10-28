-- ============================================================
-- Módulo "Acceso comercial" · Fase 2 · Agenda de reuniones
--
-- `interacciones` (0037) registra lo que YA pasó. Esta tabla es la
-- agenda: reuniones FUTURAS programadas, que el comercial ve en su
-- panel. Al marcarlas como realizadas se puede volcar el resultado a
-- `interacciones`, de modo que agenda e histórico quedan enlazados y
-- no se duplica el trabajo de escribir dos veces lo mismo.
--
-- Mismo criterio de RLS que 0037: el comercial solo ve y escribe sobre
-- su cartera; admin/dirección ven todo.
-- Idempotente. Se aplica en Supabase SQL Editor.
-- ============================================================

create table if not exists public.reuniones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  contacto_id uuid references public.contactos(id) on delete set null,
  comercial_id uuid references public.comerciales(id),
  usuario_id uuid references auth.users(id),
  fecha_hora timestamptz not null,
  duracion_min integer,
  asunto text,
  modalidad text
    check (modalidad is null or modalidad in ('presencial','telefono','videollamada')),
  estado text not null default 'programada'
    check (estado in ('programada','realizada','cancelada')),
  notas text,
  -- Interacción generada al cerrar la reunión. `set null` para que borrar
  -- el histórico no arrastre la reunión ni al revés.
  interaccion_id uuid references public.interacciones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reuniones_fecha on public.reuniones(fecha_hora);
create index if not exists idx_reuniones_cliente on public.reuniones(cliente_id, fecha_hora desc);
create index if not exists idx_reuniones_comercial on public.reuniones(comercial_id, fecha_hora);
create index if not exists idx_reuniones_empresa on public.reuniones(empresa_id);
create index if not exists idx_reuniones_estado on public.reuniones(estado, fecha_hora);

-- ---------- Trigger updated_at ----------
-- Reutiliza la función creada en 0037.
drop trigger if exists trg_reuniones_updated_at on public.reuniones;
create trigger trg_reuniones_updated_at
  before update on public.reuniones
  for each row execute function public.crm_tocar_updated_at();

-- ---------- RLS ----------
alter table public.reuniones enable row level security;

drop policy if exists reuniones_select on public.reuniones;
create policy reuniones_select on public.reuniones for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id = public.auth_comercial_id()
      or cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
    )
  )
);

drop policy if exists reuniones_insert on public.reuniones;
create policy reuniones_insert on public.reuniones for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
  )
);

drop policy if exists reuniones_update on public.reuniones;
create policy reuniones_update on public.reuniones for update using (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id = public.auth_comercial_id()
      or cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
    )
  )
) with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
  )
);

drop policy if exists reuniones_delete on public.reuniones;
create policy reuniones_delete on public.reuniones for delete using (
  public.auth_role() in ('admin','direccion')
);

-- ---------- Grants ----------
grant select, insert, update, delete on public.reuniones to authenticated;
