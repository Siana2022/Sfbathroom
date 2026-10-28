-- ============================================================
-- Módulo "Acceso comercial" · Fase 1
-- Contactos por cliente + histórico de interacciones (llamadas,
-- emails, reuniones, notas) con resumen IA bajo demanda.
--
-- RLS desde el primer momento: un comercial solo ve y escribe
-- sobre su propia cartera; admin/dirección ven todo.
-- Idempotente. Se aplica en Supabase SQL Editor.
-- ============================================================

-- ---------- 1. Contactos ----------
-- El nombre/email/teléfono de contacto es de PERSONA, no de empresa:
-- un cliente puede tener varias. país/provincia viven aquí para que los
-- envíos masivos filtren por territorio sin tocar public.clientes.
create table if not exists public.contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  apellidos text,
  cargo text,
  email text,
  telefono text,
  movil text,
  pais text,
  provincia text,
  idioma text,
  activo boolean not null default true,
  notas text,
  comercial_id uuid references public.comerciales(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contactos_cliente on public.contactos(cliente_id);
create index if not exists idx_contactos_empresa on public.contactos(empresa_id);
create index if not exists idx_contactos_comercial on public.contactos(comercial_id);
create index if not exists idx_contactos_pais on public.contactos(pais, provincia);

-- ---------- 2. Interacciones ----------
-- Histórico de conversaciones. `contenido` es escritura libre del comercial;
-- `resumen_ia`/`conclusiones_ia` se rellenan SOLO a petición (botón), nunca
-- automáticamente, para no gastar cuota de LLM sin necesidad.
create table if not exists public.interacciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  contacto_id uuid references public.contactos(id) on delete set null,
  comercial_id uuid references public.comerciales(id),
  usuario_id uuid references auth.users(id),
  tipo text not null default 'nota'
    check (tipo in ('llamada','email','reunion','visita','nota')),
  fecha timestamptz not null default now(),
  asunto text,
  contenido text not null,
  resultado text
    check (resultado is null or resultado in ('positivo','neutro','negativo','sin_respuesta')),
  duracion_min integer,
  resumen_ia text,
  conclusiones_ia text,
  resumen_generado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_interacciones_cliente on public.interacciones(cliente_id, fecha desc);
create index if not exists idx_interacciones_empresa on public.interacciones(empresa_id);
create index if not exists idx_interacciones_comercial on public.interacciones(comercial_id);
create index if not exists idx_interacciones_contacto on public.interacciones(contacto_id);

-- ---------- 3. Trigger updated_at ----------
create or replace function public.crm_tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contactos_updated_at on public.contactos;
create trigger trg_contactos_updated_at
  before update on public.contactos
  for each row execute function public.crm_tocar_updated_at();

-- ---------- 4. RLS ----------
alter table public.contactos enable row level security;
alter table public.interacciones enable row level security;

-- ¿La fila pertenece a la cartera del comercial que consulta?
-- Se apoya en auth_comercial_id() (0004), que ya resuelve profiles.comercial_id.

-- ---- contactos ----
drop policy if exists contactos_select on public.contactos;
create policy contactos_select on public.contactos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id = public.auth_comercial_id()
      or cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
    )
  )
);

-- El comercial puede crear y editar contactos de su cartera. El alta debe
-- quedar asignada a su propio comercial_id o a un cliente suyo.
drop policy if exists contactos_insert on public.contactos;
create policy contactos_insert on public.contactos for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
    )
  )
);

drop policy if exists contactos_update on public.contactos;
create policy contactos_update on public.contactos for update using (
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

-- Borrado: solo admin/dirección. Un comercial no debe borrar historial de
-- contactos (trazabilidad comercial), los desactiva con `activo = false`.
drop policy if exists contactos_delete on public.contactos;
create policy contactos_delete on public.contactos for delete using (
  public.auth_role() in ('admin','direccion')
);

-- ---- interacciones ----
drop policy if exists interacciones_select on public.interacciones;
create policy interacciones_select on public.interacciones for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id = public.auth_comercial_id()
      or cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
    )
  )
);

drop policy if exists interacciones_insert on public.interacciones;
create policy interacciones_insert on public.interacciones for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
  )
);

drop policy if exists interacciones_update on public.interacciones;
create policy interacciones_update on public.interacciones for update using (
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

drop policy if exists interacciones_delete on public.interacciones;
create policy interacciones_delete on public.interacciones for delete using (
  public.auth_role() in ('admin','direccion')
);

-- ---------- 5. Grants ----------
-- La app usa el rol `authenticated`; el RLS filtra las filas.
grant select, insert, update, delete on public.contactos to authenticated;
grant select, insert, update, delete on public.interacciones to authenticated;
