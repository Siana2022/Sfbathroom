-- Interacciones de Zoho sobre la tabla que YA existe en producción.
--
-- La tabla `public.interacciones` la creó la migración 0037 (rama
-- `feat/acceso-comercial`, aplicada en Supabase pero no mergeada en `main`), con
-- otra estructura: `asunto`/`contenido`/`duracion_min`, `cliente_id` NOT NULL y
-- `resultado` limitado a cuatro valores. Esta migración NO la recrea: la adapta.
--
-- Por eso se reutilizan sus columnas en vez de añadir duplicados:
--   asunto       ← Subject de la llamada
--   contenido    ← Description
--   duracion_min ← Call_Duration (Zoho ya lo da en minutos)
--
-- Idempotente: se puede pegar en el SQL Editor de Supabase más de una vez.
--
-- Nota sobre oportunidades: el inventario de Zoho (23 nov 2026) da 0 Deals, así que
-- NO se crea la tabla `oportunidades`.

-- ── Tabla (solo se crea si el entorno no la tiene ya) ────────────────────────
create table if not exists public.interacciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid,
  comercial_id uuid references public.comerciales(id) on delete set null,
  usuario_id uuid references auth.users(id) on delete set null,
  tipo text not null default 'nota'
    check (tipo in ('llamada', 'email', 'reunion', 'visita', 'nota')),
  fecha timestamptz not null default now(),
  asunto text,
  contenido text,
  resultado text,
  duracion_min integer,
  -- true = importada sin cliente; aparece en "Pendientes de vincular".
  pendiente boolean not null default false,
  origen text,
  id_externo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Columnas que la 0037 no tenía ───────────────────────────────────────────
alter table public.interacciones add column if not exists pendiente boolean not null default false;
alter table public.interacciones add column if not exists origen text;
alter table public.interacciones add column if not exists id_externo text;
alter table public.interacciones add column if not exists updated_at timestamptz not null default now();

-- ── Relajar lo que impide importar ──────────────────────────────────────────
-- Una llamada de Zoho sin cliente no se puede asignar a ninguna empresa hasta
-- vincularla a mano: empresa_id y cliente_id tienen que admitir NULL.
alter table public.interacciones alter column empresa_id drop not null;
alter table public.interacciones alter column cliente_id drop not null;
alter table public.interacciones alter column contenido drop not null;

-- El resultado de una llamada de Zoho es texto libre ("Call not connected",
-- "Interesado", …): la lista cerrada de la 0037 lo rechazaría.
alter table public.interacciones drop constraint if exists interacciones_resultado_check;

-- ── Índices ─────────────────────────────────────────────────────────────────
-- Idempotencia de la reimportación. Índice NO parcial: PostgREST necesita inferir
-- la clave en `on_conflict=origen,id_externo`; los NULL no colisionan entre sí.
create unique index if not exists ux_interacciones_origen_externo
  on public.interacciones (origen, id_externo);

-- (idx_interacciones_cliente e idx_interacciones_empresa ya existen de la 0037.)
create index if not exists idx_interacciones_pendientes on public.interacciones (fecha desc)
  where pendiente;

-- ── Equivalencias Zoho → plataforma ─────────────────────────────────────────
create table if not exists public.mapeo_externo (
  origen text not null,                                   -- 'zoho'
  entidad text not null,                                  -- 'call' | 'note' | 'account' | 'contact'
  id_externo text not null,                               -- id en el sistema de origen
  id_interno uuid not null,                               -- id en esta base de datos
  created_at timestamptz not null default now(),
  primary key (origen, entidad, id_externo)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.mapeo_externo enable row level security;
alter table public.interacciones enable row level security;

-- mapeo_externo: sin políticas y sin grants. Solo entra service_role (la ingesta).
revoke all on public.mapeo_externo from anon, authenticated;

-- Lectura: los perfiles de cuadro ven todo; el comercial, solo su cartera.
-- Se usa es_mi_comercial (0079) para soportar varios comerciales por usuario; para
-- una interacción pendiente (sin cliente) manda su comercial_id.
drop policy if exists interacciones_select on public.interacciones;
create policy interacciones_select on public.interacciones for select using (
  public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      public.es_mi_comercial(comercial_id)
      or exists (
        select 1 from public.clientes c
        where c.id = interacciones.cliente_id
          and public.es_mi_comercial(c.comercial_id)
      )
    )
  )
);

-- El comercial mantiene la escritura sobre su cartera (la 0037 ya la permitía);
-- la importación entra con service_role y no pasa por estas políticas.
drop policy if exists interacciones_insert on public.interacciones;
create policy interacciones_insert on public.interacciones for insert with check (
  public.auth_role() in ('admin', 'direccion')
  or (
    public.auth_role() = 'comercial'
    and exists (
      select 1 from public.clientes c
      where c.id = interacciones.cliente_id
        and public.es_mi_comercial(c.comercial_id)
    )
  )
);

drop policy if exists interacciones_update on public.interacciones;
create policy interacciones_update on public.interacciones for update using (
  public.auth_role() in ('admin', 'direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      public.es_mi_comercial(comercial_id)
      or exists (
        select 1 from public.clientes c
        where c.id = interacciones.cliente_id
          and public.es_mi_comercial(c.comercial_id)
      )
    )
  )
) with check (
  public.auth_role() in ('admin', 'direccion')
  or (
    public.auth_role() = 'comercial'
    and exists (
      select 1 from public.clientes c
      where c.id = interacciones.cliente_id
        and public.es_mi_comercial(c.comercial_id)
    )
  )
);

drop policy if exists interacciones_delete on public.interacciones;
create policy interacciones_delete on public.interacciones for delete using (
  public.auth_role() in ('admin', 'direccion')
);

grant select, insert, update, delete on public.interacciones to authenticated;
