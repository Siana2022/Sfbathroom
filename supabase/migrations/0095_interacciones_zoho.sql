-- Interacciones (llamadas, notas, correos, tareas) y mapeo de identificadores
-- externos, para importar Zoho CRM sin duplicar y poder repetir la carga.
--
-- Idempotente: se puede pegar en el SQL Editor de Supabase más de una vez.
--
-- Nota sobre oportunidades: el inventario de Zoho (23 nov 2026) da 0 Deals, así que
-- NO se crea la tabla `oportunidades`. Si algún día aparecen, se añade con el mismo
-- patrón (origen + id_externo y mapeo_externo).

-- ── Equivalencias Zoho → plataforma ──────────────────────────────────────────
-- Permite resolver un id de Zoho a su fila local (cuentas, contactos, llamadas…)
-- sin volver a cruzar por nombre. Solo la usa la ingesta (service_role).
create table if not exists public.mapeo_externo (
  origen text not null,                                   -- 'zoho'
  entidad text not null,                                  -- 'call' | 'note' | 'account' | 'contact'
  id_externo text not null,                               -- id en el sistema de origen
  id_interno uuid not null,                               -- id en esta base de datos
  created_at timestamptz not null default now(),
  primary key (origen, entidad, id_externo)
);

-- ── Interacciones ────────────────────────────────────────────────────────────
create table if not exists public.interacciones (
  id uuid primary key default gen_random_uuid(),
  -- Nullable a propósito: una llamada de Zoho sin cliente identificado no se puede
  -- asignar a ninguna empresa hasta que se vincule a mano (queda `pendiente`).
  empresa_id uuid references public.empresas(id) on delete cascade,
  -- on delete set null para no perder el histórico si se borra un cliente.
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.clientes_contactos(id) on delete set null,
  comercial_id uuid references public.comerciales(id) on delete set null,
  tipo text not null check (tipo in ('llamada', 'nota', 'correo', 'tarea')),
  fecha timestamptz not null,
  titulo text,
  detalle text,
  resultado text,
  duracion_seg integer,
  -- true = importada sin cliente; aparece en "Pendientes de vincular".
  pendiente boolean not null default false,
  origen text,
  id_externo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una fila por registro de origen (idempotencia de la reimportación).
-- Índice único NO parcial: PostgREST necesita poder inferir la clave en
-- `on_conflict=origen,id_externo` para el upsert, y una cláusula WHERE se lo impide.
-- Los NULL no colisionan entre sí, así que no hace falta el filtro.
create unique index if not exists ux_interacciones_origen_externo
  on public.interacciones (origen, id_externo);

create index if not exists idx_interacciones_cliente on public.interacciones (cliente_id, fecha desc);
create index if not exists idx_interacciones_empresa on public.interacciones (empresa_id, fecha desc);
create index if not exists idx_interacciones_pendientes on public.interacciones (fecha desc)
  where pendiente;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.mapeo_externo enable row level security;
alter table public.interacciones enable row level security;

-- mapeo_externo: sin políticas y sin grants. Solo entra service_role (la ingesta).
revoke all on public.mapeo_externo from anon, authenticated;

-- Lectura: los perfiles de cuadro ven todo; el comercial, solo su cartera.
-- Para una interacción pendiente (sin cliente) se usa su comercial_id; si tampoco
-- lo tiene, no la ve ningún comercial y queda para administración.
drop policy if exists interacciones_select on public.interacciones;
create policy interacciones_select on public.interacciones for select using (
  public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura')
  or (
    public.auth_role() = 'comercial'
    and (
      exists (
        select 1 from public.clientes c
        where c.id = interacciones.cliente_id
          and public.es_mi_comercial(c.comercial_id)
      )
      or (interacciones.cliente_id is null and public.es_mi_comercial(interacciones.comercial_id))
    )
  )
);

-- Escritura manual (vincular pendientes, corregir) solo administración y dirección.
-- La importación escribe con service_role y no pasa por estas políticas.
drop policy if exists interacciones_insert on public.interacciones;
create policy interacciones_insert on public.interacciones for insert with check (
  public.auth_role() in ('admin', 'direccion')
);

drop policy if exists interacciones_update on public.interacciones;
create policy interacciones_update on public.interacciones for update using (
  public.auth_role() in ('admin', 'direccion')
) with check (
  public.auth_role() in ('admin', 'direccion')
);

drop policy if exists interacciones_delete on public.interacciones;
create policy interacciones_delete on public.interacciones for delete using (
  public.auth_role() in ('admin', 'direccion')
);

grant select on public.interacciones to authenticated;
