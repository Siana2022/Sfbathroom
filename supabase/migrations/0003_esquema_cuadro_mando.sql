-- ============================================================
-- SFBATHROOM BI · Esquema del cuadro de mando comercial
-- Alinea el esquema con docs/especificacion-comercial.md (v1.0).
-- Módulos nuevos: multiempresa, pedidos/cartera, coste por lote,
-- stock avanzado, cobros, incidencias, presupuesto, alertas.
-- Roles ampliados: + administracion, + almacen.
-- 2026-09-07.
-- ============================================================

-- ---------- 0. Multiempresa ----------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo in ('SF','DOT','FUX')),
  nombre text not null
);

insert into public.empresas (codigo, nombre) values
  ('SF', 'SF Bathroom'),
  ('DOT', 'DOT Surfaces'),
  ('FUX', 'Fuxsabany')
on conflict (codigo) do nothing;

-- ---------- 0.1 Catálogos transversales ----------
create table if not exists public.canales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

insert into public.canales (nombre) values
  ('tienda'), ('construccion'), ('fabricante_mueble')
on conflict (nombre) do nothing;

create table if not exists public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

insert into public.marcas (nombre) values ('Starbath Plus'), ('Marca blanca')
on conflict (nombre) do nothing;

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  pais text,
  plazo_entrega_dias integer,
  activo boolean not null default true
);

create table if not exists public.formatos_articulo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table if not exists public.grupos_empresariales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

-- ---------- 1. Clientes (ampliación) ----------
alter table public.clientes add column if not exists empresa_id uuid references public.empresas(id);
alter table public.clientes add column if not exists grupo_id uuid references public.grupos_empresariales(id);
alter table public.clientes add column if not exists canal_id uuid references public.canales(id);
alter table public.clientes add column if not exists pais_facturacion text;
alter table public.clientes add column if not exists pais_entrega text;
alter table public.clientes add column if not exists provincia text;
alter table public.clientes add column if not exists estado text not null default 'activo'
  check (estado in ('activo','inactivo','perdido'));
alter table public.clientes add column if not exists fecha_primer_pedido date;
alter table public.clientes add column if not exists limite_credito numeric(14,2);
alter table public.clientes add column if not exists plazo_pactado_dias integer not null default 30;

-- ---------- 2. Artículos (ampliación) ----------
alter table public.articulos add column if not exists empresa_id uuid references public.empresas(id);
alter table public.articulos add column if not exists marca_id uuid references public.marcas(id);
alter table public.articulos add column if not exists marca_blanca_cliente_id uuid references public.clientes(id);
alter table public.articulos add column if not exists formato_id uuid references public.formatos_articulo(id);
alter table public.articulos add column if not exists proveedor_id uuid references public.proveedores(id);
alter table public.articulos add column if not exists estado text not null default 'activo'
  check (estado in ('activo','descatalogado','novedad'));
alter table public.articulos add column if not exists precio_tarifa numeric(12,2);
alter table public.articulos add column if not exists punto_pedido numeric(12,2);

-- ---------- 3. Pedidos y cartera pendiente (bloque 2) ----------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_erp text unique,
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid references public.clientes(id),
  comercial_id uuid references public.comerciales(id),
  fecha_entrada date not null,
  fecha_solicitada date,
  fecha_entrega_real date,
  estado text not null default 'captado'
    check (estado in ('captado','aceptado','parcial','servido','anulado')),
  motivo_anulacion text,
  importe numeric(14,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_pedidos_fecha_entrada on public.pedidos(fecha_entrada);
create index if not exists idx_pedidos_comercial on public.pedidos(comercial_id);
create index if not exists idx_pedidos_cliente on public.pedidos(cliente_id);
create index if not exists idx_pedidos_estado on public.pedidos(estado);
create index if not exists idx_pedidos_empresa on public.pedidos(empresa_id);

create table if not exists public.pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  articulo_id uuid references public.articulos(id),
  cantidad numeric(12,2) not null,
  cantidad_servida numeric(12,2) not null default 0,
  precio_unitario numeric(12,2) not null,
  descuento_pct numeric(5,2) not null default 0,
  fecha_servida date,
  importe numeric(12,2) generated always as
    (round(cantidad * precio_unitario * (1 - descuento_pct / 100.0), 2)) stored
);

create index if not exists idx_pedido_lineas_articulo on public.pedido_lineas(articulo_id);
create index if not exists idx_pedido_lineas_pedido on public.pedido_lineas(pedido_id);

create table if not exists public.pedido_modificaciones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  tipo text not null check (tipo in ('cantidad','fecha','referencia')),
  descripcion text,
  fecha timestamptz not null default now()
);

-- ---------- 4. Facturas (bloque 1: tipo de documento, neteo, presupuesto-net) ----------
alter table public.facturas add column if not exists empresa_id uuid references public.empresas(id);
alter table public.facturas add column if not exists tipo_documento text not null default 'factura'
  check (tipo_documento in ('factura','abono','nota_cargo'));
alter table public.facturas add column if not exists factura_anula_id uuid references public.facturas(id);
alter table public.facturas add column if not exists pedido_id uuid references public.pedidos(id);
alter table public.facturas add column if not exists albaran_numero text;
alter table public.facturas add column if not exists descuento_pie numeric(12,2) not null default 0;
alter table public.facturas add column if not exists portes numeric(12,2) not null default 0;
alter table public.facturas add column if not exists rappel_devengado numeric(12,2) not null default 0;

create index if not exists idx_facturas_empresa on public.facturas(empresa_id);
create index if not exists idx_facturas_tipo on public.facturas(tipo_documento);

-- Trazabilidad: importe de línea va como importe_final aplicando descuentos de
-- cabecera (descuento de pie de factura) y portes se muestran aparte, no como venta.

-- ---------- 5. Compras / coste completo de llegada por lote (bloque 3) ----------
create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  numero_erp text unique,
  empresa_id uuid not null references public.empresas(id),
  proveedor_id uuid references public.proveedores(id),
  fecha date not null,
  moneda text not null default 'EUR',
  tipo_cambio numeric(12,6),
  flete numeric(14,2) not null default 0,
  aduana numeric(14,2) not null default 0,
  seguro numeric(14,2) not null default 0,
  transporte_interior numeric(14,2) not null default 0,
  fecha_estimada_llegada date,
  fecha_llegada date,
  created_at timestamptz not null default now()
);

create index if not exists idx_compras_fecha on public.compras(fecha);
create index if not exists idx_compras_proveedor on public.compras(proveedor_id);
create index if not exists idx_compras_empresa on public.compras(empresa_id);

create table if not exists public.compra_lineas (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras(id) on delete cascade,
  articulo_id uuid not null references public.articulos(id),
  cantidad numeric(12,2) not null,
  coste_unitario_compra numeric(12,2) not null,
  pct_roturas numeric(5,2) not null default 0
);

create index if not exists idx_compra_lineas_articulo on public.compra_lineas(articulo_id);

-- Coste completo de llegada por línea de compra (flete/aduana/seguro/transporte
-- repartidos por cantidad del lote; roturas y tipo de cambio aplicados).
create or replace view public.v_coste_completo_por_lote as
with reparto as (
  select compra_id,
         sum(cantidad) as total_cantidad_lote
  from public.compra_lineas
  group by compra_id
)
select
  cl.id,
  cl.compra_id as lote_id,
  cl.articulo_id,
  a.codigo_erp,
  a.nombre as articulo,
  c.empresa_id,
  c.proveedor_id,
  c.fecha as fecha_compra,
  c.moneda,
  c.tipo_cambio,
  cl.cantidad,
  cl.coste_unitario_compra,
  round(cl.coste_unitario_compra * coalesce(c.tipo_cambio, 1), 4) as coste_en_euros,
  round((coalesce(c.flete, 0) + coalesce(c.aduana, 0) + coalesce(c.seguro, 0)
       + coalesce(c.transporte_interior, 0)) / nullif(r.total_cantidad_lote, 0), 4) as coste_repartido_unitario,
  round(cl.coste_unitario_compra * coalesce(c.tipo_cambio, 1) * (1 + coalesce(cl.pct_roturas, 0) / 100.0)
      + (coalesce(c.flete, 0) + coalesce(c.aduana, 0) + coalesce(c.seguro, 0)
       + coalesce(c.transporte_interior, 0)) / nullif(r.total_cantidad_lote, 0), 4) as coste_completo_unitario
from public.compra_lineas cl
join public.compras c on c.id = cl.compra_id
join public.articulos a on a.id = cl.articulo_id
left join reparto r on r.compra_id = cl.compra_id
with (security_invoker = true);

-- ---------- 6. Stock avanzado (bloque 4) ----------
alter table public.almacenes add column if not exists empresa_id uuid references public.empresas(id);

alter table public.stock_actual add column if not exists stock_reservado numeric(12,2) not null default 0;

alter table public.stock_movimientos add column if not exists empresa_id uuid references public.empresas(id);

create table if not exists public.stock_en_transito (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.articulos(id),
  compra_id uuid references public.compras(id),
  empresa_id uuid not null references public.empresas(id),
  cantidad numeric(12,2) not null,
  fecha_estimada_llegada date,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_transito_articulo on public.stock_en_transito(articulo_id);

-- Consumo diario por artículo (proxy de ventas; para cobertura y propuesta de pedido).
create or replace view public.v_consumo_diario as
select f.empresa_id, fl.articulo_id, f.fecha, sum(fl.cantidad) as unidades
from public.factura_lineas fl
join public.facturas f on f.id = fl.factura_id
where f.tipo_documento = 'factura'
group by f.empresa_id, fl.articulo_id, f.fecha
with (security_invoker = true);

create index if not exists idx_stock_actual_almacen on public.stock_actual(almacen_id);

-- Cobertura en días y stock disponible real por artículo/almacén.
create or replace view public.v_stock_cobertura as
select
  sa.articulo_id,
  a.codigo_erp,
  a.nombre as articulo,
  a.punto_pedido,
  al.nombre as almacen,
  al.empresa_id,
  sa.cantidad as stock_fisico,
  sa.stock_reservado,
  sa.cantidad - sa.stock_reservado as stock_disponible,
  round(coalesce(c.consumo_90, 0) / 90.0, 2) as consumo_medio_diario,
  round((sa.cantidad - sa.stock_reservado) / nullif(coalesce(c.consumo_90, 0) / 90.0, 0), 1) as cobertura_dias,
  round(coalesce(t.en_transito, 0), 2) as en_transito
from public.stock_actual sa
join public.articulos a on a.id = sa.articulo_id
join public.almacenes al on al.id = sa.almacen_id
left join (
  select articulo_id, sum(unidades) as consumo_90
  from public.v_consumo_diario
  where fecha >= current_date - interval '90 days'
  group by articulo_id
) c on c.articulo_id = sa.articulo_id
left join (
  select articulo_id, sum(cantidad) as en_transito
  from public.stock_en_transito
  group by articulo_id
) t on t.articulo_id = sa.articulo_id
with (security_invoker = true);

-- ---------- 7. Cobros y crédito (bloque 8) ----------
create table if not exists public.cobros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id),
  factura_id uuid references public.facturas(id),
  fecha date not null,
  importe numeric(14,2) not null,
  metodo text,
  impagado boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_cobros_cliente on public.cobros(cliente_id);
create index if not exists idx_cobros_fecha on public.cobros(fecha);
create index if not exists idx_cobros_factura on public.cobros(factura_id);

-- Aging: pendiente por factura (vista principal de vencimiento y saldo).
create or replace view public.v_aging as
select
  f.id as factura_id,
  f.numero_erp,
  f.empresa_id,
  f.cliente_id,
  f.fecha,
  coalesce(f.total, 0) as importe,
  coalesce(f.total, 0) - coalesce(c.cobrado, 0) as pendiente,
  (current_date - f.fecha) as dias_vencido
from public.facturas f
left join (
  select factura_id, sum(importe) as cobrado
  from public.cobros
  where not impagado
  group by factura_id
) c on c.factura_id = f.id
where f.tipo_documento in ('factura', 'nota_cargo')
with (security_invoker = true);

-- Saldo y DSO por cliente.
create or replace view public.v_saldo_clientes as
select
  empresa_id,
  cliente_id,
  sum(case when dias_vencido < 0 then pendiente else 0 end) as en_cartera,
  sum(case when dias_vencido >= 0 and pendiente > 0 then pendiente else 0 end) as vencido,
  sum(pendiente) as saldo_total
from public.v_aging
group by empresa_id, cliente_id
with (security_invoker = true);

-- ---------- 8. Incidencias / devoluciones (bloque 10) ----------
create table if not exists public.incidencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid references public.clientes(id),
  articulo_id uuid references public.articulos(id),
  pedido_id uuid references public.pedidos(id),
  tipo text not null
    check (tipo in ('rotura_transporte','defecto_fabricacion','error_pedido','error_expedicion','rechazo_comercial')),
  importe numeric(14,2) not null default 0,
  estado text not null default 'abierta' check (estado in ('abierta','resuelta','rechazada')),
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_incidencias_cliente on public.incidencias(cliente_id);
create index if not exists idx_incidencias_articulo on public.incidencias(articulo_id);
create index if not exists idx_incidencias_fecha on public.incidencias(fecha);

-- ---------- 9. Presupuesto (bloque 1.5) ----------
create table if not exists public.presupuesto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  ejercicio integer not null,
  mes integer not null check (mes between 1 and 12),
  cliente_id uuid references public.clientes(id),
  comercial_id uuid references public.comerciales(id),
  familia_id uuid references public.familias_articulo(id),
  importe numeric(14,2) not null
);

create index if not exists idx_presupuesto_empresa_ejercicio on public.presupuesto(empresa_id, ejercicio);

-- ---------- 10. Alertas configurables (bloque 11) ----------
create table if not exists public.alertas_config (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  nombre text not null,
  umbral numeric(14,4),
  unidad text,
  activo boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (modulo, nombre)
);

create table if not exists public.alertas_generadas (
  id uuid primary key default gen_random_uuid(),
  alertas_config_id uuid references public.alertas_config(id),
  empresa_id uuid references public.empresas(id),
  referencia text,
  importe numeric(14,2),
  mensaje text,
  leida boolean not null default false,
  fecha timestamptz not null default now()
);

create index if not exists idx_alertas_generadas_fecha on public.alertas_generadas(fecha);

-- ---------- 11. Multicanal / financiero: empresa_id ----------
alter table public.marketing_inversion add column if not exists empresa_id uuid references public.empresas(id);
alter table public.ventas_semanales add column if not exists empresa_id uuid references public.empresas(id);
alter table public.financiero_cuentas_anuales add column if not exists empresa_id uuid references public.empresas(id);
alter table public.financiero_kpis add column if not exists empresa_id uuid references public.empresas(id);

-- Config de fuentes: nuevos módulos.
alter table public.fuentes_datos_config drop constraint if exists fuentes_datos_config_modulo_check;
alter table public.fuentes_datos_config add constraint fuentes_datos_config_modulo_check
  check (modulo in ('comercial','margen','stock','marketing','financiero','pedidos','cobros','devoluciones'));

-- ============================================================
-- Backfill de empresa: los datos existentes pertenecen a SF Bathroom
-- ============================================================
do $$
declare sf uuid;
begin
  select id into sf from public.empresas where codigo = 'SF';

  update public.clientes set empresa_id = sf where empresa_id is null;
  update public.articulos set empresa_id = sf where empresa_id is null;
  update public.facturas set empresa_id = sf where empresa_id is null;
  update public.almacenes set empresa_id = sf where empresa_id is null;
  update public.stock_movimientos set empresa_id = sf where empresa_id is null;
  update public.marketing_inversion set empresa_id = sf where empresa_id is null;
  update public.ventas_semanales set empresa_id = sf where empresa_id is null;
  update public.financiero_cuentas_anuales set empresa_id = sf where empresa_id is null;
  update public.financiero_kpis set empresa_id = sf where empresa_id is null;

  alter table public.clientes alter column empresa_id set not null;
  alter table public.articulos alter column empresa_id set not null;
  alter table public.facturas alter column empresa_id set not null;
  alter table public.almacenes alter column empresa_id set not null;
  alter table public.stock_movimientos alter column empresa_id set not null;
  alter table public.marketing_inversion alter column empresa_id set not null;
  alter table public.ventas_semanales alter column empresa_id set not null;
  alter table public.financiero_cuentas_anuales alter column empresa_id set not null;
  alter table public.financiero_kpis alter column empresa_id set not null;
end $$;

-- ============================================================
-- Roles ampliados: + administracion (cobros y cartera), + almacen (stock y servicio)
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','direccion','comercial','financiero','lectura','administracion','almacen'));

-- ============================================================
-- Row Level Security (tablas nuevas)
-- ============================================================

-- Catálogos y dimensiones: lectura para cualquier autenticado, escritura admin/direccion.
alter table public.empresas enable row level security;
alter table public.canales enable row level security;
alter table public.marcas enable row level security;
alter table public.proveedores enable row level security;
alter table public.formatos_articulo enable row level security;
alter table public.grupos_empresariales enable row level security;

do $$
declare t text;
begin
  foreach t in array array['empresas','canales','marcas','proveedores','formatos_articulo','grupos_empresariales'] loop
    execute format('create policy %I_catalogos_select on public.%I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('create policy %I_catalogos_write on public.%I for all using (public.auth_role() in (''admin'',''direccion'')) with check (public.auth_role() in (''admin'',''direccion''))', t, t);
  end loop;
end $$;

-- Pedidos y líneas: todos los roles operativos; comercial solo lo suyo.
alter table public.pedidos enable row level security;
alter table public.pedido_lineas enable row level security;

create policy pedidos_select on public.pedidos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);
create policy pedidos_write on public.pedidos for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy pedido_lineas_select on public.pedido_lineas for select using (
  exists (
    select 1 from public.pedidos p
    where p.id = pedido_lineas.pedido_id
      and (
        public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
        or (public.auth_role() = 'comercial' and p.comercial_id = public.auth_comercial_id())
      )
  )
);

-- Historial de modificaciones: solo administración.
alter table public.pedido_modificaciones enable row level security;
create policy pedido_modificaciones_select on public.pedido_modificaciones for select using (
  public.auth_role() in ('admin','direccion','administracion')
);
create policy pedido_modificaciones_write on public.pedido_modificaciones for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

-- Compras / coste (margen): solo dirección y financiero.
alter table public.compras enable row level security;
alter table public.compra_lineas enable row level security;

create policy compras_select on public.compras for select using (
  public.auth_role() in ('admin','direccion','financiero')
);
create policy compras_write on public.compras for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy compra_lineas_select on public.compra_lineas for select using (
  exists (
    select 1 from public.compras c
    where c.id = compra_lineas.compra_id
      and public.auth_role() in ('admin','direccion','financiero')
  )
);

-- Stock en tránsito: cualquier autenticado (sin datos de coste).
alter table public.stock_en_transito enable row level security;
create policy stock_transito_select on public.stock_en_transito for select using (auth.role() = 'authenticated');
create policy stock_transito_write on public.stock_en_transito for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

-- Cobros: dirección, financiero y administración; comercial no ve importes de cobro.
alter table public.cobros enable row level security;
create policy cobros_select on public.cobros for select using (
  public.auth_role() in ('admin','direccion','financiero','administracion')
);
create policy cobros_write on public.cobros for all using (public.auth_role() in ('admin','direccion','administracion'))
  with check (public.auth_role() in ('admin','direccion','administracion'));

-- Incidencias: dirección/financiero; comercial ve incidencias de su cartera.
alter table public.incidencias enable row level security;
create policy incidencias_select on public.incidencias for select using (
  public.auth_role() in ('admin','direccion','financiero')
  or (
    public.auth_role() = 'comercial'
    and exists (
      select 1 from public.clientes cl
      where cl.id = incidencias.cliente_id
        and cl.comercial_id = public.auth_comercial_id()
    )
  )
);
create policy incidencias_write on public.incidencias for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

-- Presupuesto: dirección/financiero/lectura; comercial ve su presupuesto.
alter table public.presupuesto enable row level security;
create policy presupuesto_select on public.presupuesto for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id = public.auth_comercial_id())
);
create policy presupuesto_write on public.presupuesto for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

-- Alertas: configuración visible a todos (para leer el cuadro), escritura admin/direccion.
alter table public.alertas_config enable row level security;
alter table public.alertas_generadas enable row level security;

create policy alertas_config_select on public.alertas_config for select using (auth.role() = 'authenticated');
create policy alertas_config_write on public.alertas_config for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy alertas_generadas_select on public.alertas_generadas for select using (auth.role() = 'authenticated');
create policy alertas_generadas_write on public.alertas_generadas for all using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));