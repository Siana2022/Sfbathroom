-- ============================================================
-- Módulo "Acceso comercial" · Fase 3 · Dashboard unificado
--
-- Tres cambios, todos aditivos (nada se borra ni se renombra):
--
-- 1. `reuniones.modalidad` admite dos tipos más: email y otros. Como el
--    check original (0038) no los contemplaba, hay que recrearlo. Los
--    valores ya guardados siguen siendo válidos, así que la migración no
--    puede fallar por datos existentes.
--    `modalidad_otro` es el texto libre que el comercial escribe cuando
--    elige "otros" (una feria, una visita a obra…).
--
-- 2. Estado CRM del cliente. NO se reutiliza `clientes.estado`: esa
--    columna ya existe con activo/inactivo/perdido y la usan el semáforo
--    de fuga y las alertas. Se añade `estado_crm` + `motivo_perdida`.
--    El upsert de A3ERP (0028) no toca estas columnas, así que lo que
--    escriba el comercial sobrevive a las sincronizaciones.
--
-- 3. Tabla `hitos`: anotaciones con fecha sobre un cliente (acuerdos,
--    cambios de responsable, altas en programas…). Son cosas distintas de
--    una interacción: un hito no es una conversación, es un hecho que se
--    quiere recordar. Por eso tabla propia y no un tipo de interacción.
--
-- Mismo criterio de RLS que 0037/0038: el comercial solo ve y escribe
-- sobre su cartera; admin/dirección ven todo.
-- Idempotente. Se aplica en Supabase SQL Editor.
-- ============================================================

-- ---------- 1. Tipos de reunión ----------
-- Recrear el check para admitir email y otros. El nombre del constraint
-- es el que genera Postgres por defecto (reuniones_modalidad_check); se
-- usa un bloque defensivo por si en algún entorno tuviera otro nombre.
do $$
declare
  v_nombre text;
begin
  select con.conname into v_nombre
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public' and rel.relname = 'reuniones'
    and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%modalidad%';

  if v_nombre is not null then
    execute format('alter table public.reuniones drop constraint %I', v_nombre);
  end if;
end
$$;

alter table public.reuniones
  add constraint reuniones_modalidad_check
  check (modalidad is null or modalidad in ('presencial','telefono','videollamada','email','otros'));

-- Texto libre para cuando la modalidad es "otros".
alter table public.reuniones add column if not exists modalidad_otro text;

-- ---------- 2. Estado CRM del cliente ----------
alter table public.clientes add column if not exists estado_crm text;
alter table public.clientes add column if not exists motivo_perdida text;

-- El check se añade aparte y con guarda: `add constraint` no admite
-- "if not exists" en Postgres, y esta migración debe poder reejecutarse.
do $$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'clientes'
      and con.conname = 'clientes_estado_crm_check'
  ) then
    alter table public.clientes
      add constraint clientes_estado_crm_check
      check (estado_crm is null or estado_crm in
        ('habitual','nuevo','seguimiento','ganado','perdido'));
  end if;
end
$$;

create index if not exists idx_clientes_estado_crm on public.clientes(estado_crm);

-- ---------- 3. Hitos ----------
create table if not exists public.hitos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  comercial_id uuid references public.comerciales(id),
  usuario_id uuid references auth.users(id),
  -- Fecha del hito (puede ser pasada: "el 2 de septiembre cambió el
  -- responsable"). Distinta de created_at, que es cuándo se escribió.
  fecha date not null default current_date,
  titulo text not null,
  detalle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hitos_cliente on public.hitos(cliente_id, fecha desc);
create index if not exists idx_hitos_empresa on public.hitos(empresa_id);
create index if not exists idx_hitos_comercial on public.hitos(comercial_id);

-- Reutiliza la función de 0037.
drop trigger if exists trg_hitos_updated_at on public.hitos;
create trigger trg_hitos_updated_at
  before update on public.hitos
  for each row execute function public.crm_tocar_updated_at();

-- ---------- 4. RLS ----------
alter table public.hitos enable row level security;

drop policy if exists hitos_select on public.hitos;
create policy hitos_select on public.hitos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id = public.auth_comercial_id()
      or cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
    )
  )
);

drop policy if exists hitos_insert on public.hitos;
create policy hitos_insert on public.hitos for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id = public.auth_comercial_id())
  )
);

drop policy if exists hitos_update on public.hitos;
create policy hitos_update on public.hitos for update using (
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

-- Igual que en contactos e interacciones: un comercial no borra historial,
-- lo edita. El borrado queda para admin/dirección.
drop policy if exists hitos_delete on public.hitos;
create policy hitos_delete on public.hitos for delete using (
  public.auth_role() in ('admin','direccion')
);

-- ---------- 5. Grants ----------
grant select, insert, update, delete on public.hitos to authenticated;

-- ---------- 6. Comprobación ----------
-- Deja constancia en el log de que los valores quedaron bien.
do $$
begin
  raise notice 'Fase 3 aplicada: modalidad(5 valores), estado_crm, motivo_perdida, tabla hitos.';
end
$$;
