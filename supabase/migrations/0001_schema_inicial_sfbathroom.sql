-- ============================================================
-- SFBATHROOM BI · Esquema inicial
-- Módulos: Comercial, Margen, Stock, Marketing (MMM), Financiero
-- Aplicado en Supabase (proyecto dgbxualxhrbbqglvxtxq) el 2026-09-07.
-- ============================================================

-- ---------- Extensiones ----------
create extension if not exists pgcrypto;

-- ---------- Roles / Perfiles de usuario ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'lectura'
    check (role in ('admin','direccion','comercial','financiero','lectura')),
  comercial_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de acceso de cada usuario autenticado, con su rol funcional.';

-- Trigger: crear fila en profiles automáticamente al registrar un usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Catálogos comerciales ----------
create table if not exists public.comerciales (
  id uuid primary key default gen_random_uuid(),
  codigo_erp text unique,
  nombre text not null,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_comercial_id_fkey
  foreign key (comercial_id) references public.comerciales(id);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  codigo_erp text unique,
  nombre text not null,
  cif text,
  comercial_id uuid references public.comerciales(id),
  created_at timestamptz not null default now()
);

create table if not exists public.familias_articulo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table if not exists public.articulos (
  id uuid primary key default gen_random_uuid(),
  codigo_erp text unique,
  nombre text not null,
  familia_id uuid references public.familias_articulo(id),
  coste_unitario numeric(12,2),
  precio_venta numeric(12,2),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Facturación / Ventas (módulo Comercial) ----------
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  numero_erp text unique,
  fecha date not null,
  cliente_id uuid references public.clientes(id),
  comercial_id uuid references public.comerciales(id),
  base_imponible numeric(12,2),
  total numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_facturas_fecha on public.facturas(fecha);
create index if not exists idx_facturas_comercial on public.facturas(comercial_id);
create index if not exists idx_facturas_cliente on public.facturas(cliente_id);

create table if not exists public.factura_lineas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas(id) on delete cascade,
  articulo_id uuid references public.articulos(id),
  cantidad numeric(12,2) not null,
  precio_unitario numeric(12,2) not null,
  coste_unitario numeric(12,2),
  descuento_pct numeric(5,2) not null default 0,
  importe numeric(12,2) generated always as
    (round(cantidad * precio_unitario * (1 - descuento_pct / 100.0), 2)) stored
);

create index if not exists idx_factura_lineas_articulo on public.factura_lineas(articulo_id);
create index if not exists idx_factura_lineas_factura on public.factura_lineas(factura_id);

-- Vista: margen por producto
create or replace view public.v_margen_por_articulo as
select
  a.id as articulo_id,
  a.codigo_erp,
  a.nombre as articulo,
  fa.nombre as familia,
  sum(fl.cantidad) as unidades_vendidas,
  sum(fl.importe) as importe_vendido,
  sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0)) as coste_total,
  sum(fl.importe) - sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0)) as margen_total,
  case when sum(fl.importe) > 0 then
    round(100 * (sum(fl.importe) - sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0))) / sum(fl.importe), 2)
  else null end as margen_pct
from public.factura_lineas fl
join public.articulos a on a.id = fl.articulo_id
left join public.familias_articulo fa on fa.id = a.familia_id
group by a.id, a.codigo_erp, a.nombre, fa.nombre;

-- ---------- Stock en tiempo real ----------
create table if not exists public.almacenes (
  id uuid primary key default gen_random_uuid(),
  codigo_erp text unique,
  nombre text not null,
  direccion text
);

create table if not exists public.stock_actual (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.articulos(id),
  almacen_id uuid not null references public.almacenes(id),
  cantidad numeric(12,2) not null default 0,
  actualizado_en timestamptz not null default now(),
  unique (articulo_id, almacen_id)
);

create table if not exists public.stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid references public.articulos(id),
  almacen_id uuid references public.almacenes(id),
  tipo text not null check (tipo in ('entrada','salida','ajuste')),
  cantidad numeric(12,2) not null,
  referencia_erp text,
  fecha timestamptz not null default now()
);

create index if not exists idx_stock_actual_articulo on public.stock_actual(articulo_id);
create index if not exists idx_stock_mov_fecha on public.stock_movimientos(fecha);

-- ---------- Marketing Mix Modeling ----------
create table if not exists public.marketing_canales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table if not exists public.marketing_inversion (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid references public.marketing_canales(id),
  fecha date not null,
  importe numeric(12,2) not null default 0,
  impresiones bigint,
  clics numeric(14,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_inversion_fecha on public.marketing_inversion(fecha);

create table if not exists public.ventas_semanales (
  id uuid primary key default gen_random_uuid(),
  semana date not null unique,
  ventas_totales numeric(14,2),
  created_at timestamptz not null default now()
);

-- ---------- Financiero ----------
create table if not exists public.financiero_cuentas_anuales (
  id uuid primary key default gen_random_uuid(),
  ejercicio integer not null,
  tipo text not null check (tipo in ('balance','pyg','flujo_caja')),
  partida text not null,
  importe numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (ejercicio, tipo, partida)
);

create table if not exists public.financiero_kpis (
  id uuid primary key default gen_random_uuid(),
  ejercicio integer not null,
  periodo text not null,
  kpi text not null,
  valor numeric(14,4),
  unidad text,
  created_at timestamptz not null default now(),
  unique (ejercicio, periodo, kpi)
);

-- ---------- Config de fuentes de datos (no-secretas) ----------
create table if not exists public.fuentes_datos_config (
  id uuid primary key default gen_random_uuid(),
  modulo text not null check (modulo in ('comercial','margen','stock','marketing','financiero')),
  nombre_sistema text not null,
  tipo_conexion text not null check (tipo_conexion in ('api','csv_import','manual','base_datos')),
  config jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.fuentes_datos_config (modulo, nombre_sistema, tipo_conexion, config, activo)
values ('comercial', 'A3ERP', 'manual', '{"estado":"pendiente_de_definir_integracion"}'::jsonb, false)
on conflict do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================

create or replace function public.auth_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_comercial_id()
returns uuid
language sql
security definer
stable
as $$
  select comercial_id from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.comerciales enable row level security;
alter table public.clientes enable row level security;
alter table public.familias_articulo enable row level security;
alter table public.articulos enable row level security;
alter table public.facturas enable row level security;
alter table public.factura_lineas enable row level security;
alter table public.almacenes enable row level security;
alter table public.stock_actual enable row level security;
alter table public.stock_movimientos enable row level security;
alter table public.marketing_canales enable row level security;
alter table public.marketing_inversion enable row level security;
alter table public.ventas_semanales enable row level security;
alter table public.financiero_cuentas_anuales enable row level security;
alter table public.financiero_kpis enable row level security;
alter table public.fuentes_datos_config enable row level security;

-- profiles: cada uno ve su propio perfil; admin ve todos
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.auth_role() in ('admin','direccion'));
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.auth_role() = 'admin');

-- Catálogos y stock: lectura para todos los roles autenticados salvo restricción explícita
create policy catalogos_select on public.comerciales for select using (auth.role() = 'authenticated');
create policy clientes_select on public.clientes for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);
create policy familias_select on public.familias_articulo for select using (auth.role() = 'authenticated');
create policy articulos_select on public.articulos for select using (auth.role() = 'authenticated');
create policy almacenes_select on public.almacenes for select using (auth.role() = 'authenticated');
create policy stock_actual_select on public.stock_actual for select using (auth.role() = 'authenticated');
create policy stock_mov_select on public.stock_movimientos for select using (auth.role() = 'authenticated');

-- Ventas: admin/direccion/financiero ven todo; comercial solo lo suyo; lectura ve todo (sin importes de coste vía la vista de margen, que se restringe aparte)
create policy facturas_select on public.facturas for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);
create policy factura_lineas_select on public.factura_lineas for select using (
  exists (
    select 1 from public.facturas f
    where f.id = factura_lineas.factura_id
      and (
        public.auth_role() in ('admin','direccion','financiero','lectura')
        or (public.auth_role() = 'comercial' and f.comercial_id = public.auth_comercial_id())
      )
  )
);

-- Marketing (MMM): solo admin/direccion/financiero
create policy marketing_canales_select on public.marketing_canales for select using (
  public.auth_role() in ('admin','direccion','financiero')
);
create policy marketing_inversion_select on public.marketing_inversion for select using (
  public.auth_role() in ('admin','direccion','financiero')
);
create policy ventas_semanales_select on public.ventas_semanales for select using (auth.role() = 'authenticated');

-- Financiero: solo admin/direccion/financiero
create policy financiero_cuentas_select on public.financiero_cuentas_anuales for select using (
  public.auth_role() in ('admin','direccion','financiero')
);
create policy financiero_kpis_select on public.financiero_kpis for select using (
  public.auth_role() in ('admin','direccion','financiero')
);

-- Config de fuentes: solo admin
create policy fuentes_config_select on public.fuentes_datos_config for select using (
  public.auth_role() in ('admin','direccion')
);

-- Escritura (insert/update/delete): reservada a admin/direccion desde la app;
-- la ingesta automática (ETL/n8n) usará la service_role key, que no pasa por RLS.
create policy comerciales_write on public.comerciales for all using (public.auth_role() in ('admin','direccion')) with check (public.auth_role() in ('admin','direccion'));
create policy clientes_write on public.clientes for all using (public.auth_role() in ('admin','direccion')) with check (public.auth_role() in ('admin','direccion'));
create policy articulos_write on public.articulos for all using (public.auth_role() in ('admin','direccion')) with check (public.auth_role() in ('admin','direccion'));
create policy familias_write on public.familias_articulo for all using (public.auth_role() in ('admin','direccion')) with check (public.auth_role() in ('admin','direccion'));
create policy almacenes_write on public.almacenes for all using (public.auth_role() in ('admin','direccion')) with check (public.auth_role() in ('admin','direccion'));
create policy fuentes_config_write on public.fuentes_datos_config for all using (public.auth_role() in ('admin','direccion')) with check (public.auth_role() in ('admin','direccion'));
