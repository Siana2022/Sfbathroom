-- ============================================================
-- SFBATHROOM BI · Ingesta A3ERP (ventas): staging + swap atómico
-- Esquema a3erp, aislado de public. El ETL (runner nocturno) escribe
-- en staging con service_role y llama a a3erp.aplicar_ventas(), que
-- sustituye el rango en una sola transacción (idempotente y detecta
-- borrados dentro del rango). Precedencia de migración: 0019.
--
-- Nota multiempresa: cada empresa del grupo tiene su propia base de
-- datos A3ERP (SF->SFBATHROOM, FUX->FUXSA, DOT->DOTSURFACE). Los códigos
-- de cliente/artículo/comercial y la numeración de facturas se repiten
-- entre empresas, por lo que las claves únicas pasan a ser compuestas
-- (codigo/numero + empresa_id) y el swap se ejecuta por empresa.
-- ============================================================

create schema if not exists a3erp;

-- ---------- Multiempresa: garantizar empresa_id en los 4 catálogos ----------
-- (clientes/articulos/facturas ya lo tienen desde la 0003; comerciales NO, se crea
-- aquí ANTES de las constraints para que el script sea idempotente y re-ejecutable).
alter table public.clientes    add column if not exists empresa_id uuid references public.empresas(id);
alter table public.articulos   add column if not exists empresa_id uuid references public.empresas(id);
alter table public.comerciales add column if not exists empresa_id uuid references public.empresas(id);
alter table public.facturas    add column if not exists empresa_id uuid references public.empresas(id);

-- Backfill a SF de cualquier registro que quedara sin empresa.
update public.clientes c set empresa_id = e.id from public.empresas e where e.codigo = 'SF' and c.empresa_id is null;
update public.articulos a set empresa_id = e.id from public.empresas e where e.codigo = 'SF' and a.empresa_id is null;
update public.comerciales c set empresa_id = e.id from public.empresas e where e.codigo = 'SF' and c.empresa_id is null;
update public.facturas f set empresa_id = e.id from public.empresas e where e.codigo = 'SF' and f.empresa_id is null;

-- ---------- Claves únicas compuestas por empresa ----------
-- Se eliminan primero las unicidades antiguas de una columna (codigo_erp / numero_erp)
-- y se re-emiten las compuestas con drop-if-exists para poder re-ejecutar.
do $$
declare
  r record;
begin
  for r in select tc.constraint_name, tc.table_name, string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as cols
           from information_schema.table_constraints tc
           join information_schema.key_column_usage kcu
             on kcu.constraint_schema = tc.constraint_schema
            and kcu.constraint_name = tc.constraint_name
           where tc.constraint_schema = 'public'
             and tc.constraint_type = 'UNIQUE'
             and ((tc.table_name = 'clientes' and tc.constraint_name like 'clientes_codigo_erp%')
               or (tc.table_name = 'articulos' and tc.constraint_name like 'articulos_codigo_erp%')
               or (tc.table_name = 'comerciales' and tc.constraint_name like 'comerciales_codigo_erp%')
               or (tc.table_name = 'facturas' and tc.constraint_name like 'facturas_numero_erp%'))
           group by tc.constraint_name, tc.table_name
  loop
    if r.cols = 'codigo_erp' or r.cols = 'numero_erp' then
      execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
    end if;
  end loop;
end $$;

alter table public.clientes drop constraint if exists clientes_codigo_erp_empresa_key;
alter table public.clientes add constraint clientes_codigo_erp_empresa_key unique (codigo_erp, empresa_id);
alter table public.articulos drop constraint if exists articulos_codigo_erp_empresa_key;
alter table public.articulos add constraint articulos_codigo_erp_empresa_key unique (codigo_erp, empresa_id);
alter table public.comerciales drop constraint if exists comerciales_codigo_erp_empresa_key;
alter table public.comerciales add constraint comerciales_codigo_erp_empresa_key unique (codigo_erp, empresa_id);
alter table public.facturas drop constraint if exists facturas_numero_erp_empresa_key;
alter table public.facturas add constraint facturas_numero_erp_empresa_key unique (numero_erp, empresa_id);

create index if not exists idx_clientes_erp_empresa on public.clientes(codigo_erp, empresa_id);
create index if not exists idx_articulos_erp_empresa on public.articulos(codigo_erp, empresa_id);
create index if not exists idx_comerciales_erp_empresa on public.comerciales(codigo_erp, empresa_id);
create index if not exists idx_facturas_erp_empresa on public.facturas(numero_erp, empresa_id);

-- ---------- Staging de ventas (documentos) ----------
create table if not exists a3erp.staging_facturas (
  id uuid primary key,
  numero_erp text not null,
  empresa_codigo text not null,
  fecha date not null,
  tipo_documento text not null check (tipo_documento in ('factura', 'abono', 'nota_cargo')),
  cliente_codigo text,
  cliente_nombre text,
  comercial_codigo text,
  comercial_nombre text,
  base_imponible numeric(14, 2),
  total numeric(14, 2),
  portes numeric(14, 2) not null default 0,
  descuento_pie numeric(14, 2) not null default 0,
  rappel_devengado numeric(14, 2) not null default 0,
  albaran_numero text,
  factura_anula_numero text
);

create index if not exists idx_sf_fecha on a3erp.staging_facturas(fecha);
create index if not exists idx_sf_numero on a3erp.staging_facturas(numero_erp);

-- ---------- Staging de líneas ----------
create table if not exists a3erp.staging_factura_lineas (
  id uuid primary key,
  factura_numero_erp text not null,
  articulo_codigo text,
  articulo_nombre text,
  cantidad numeric(14, 2) not null,
  precio_unitario numeric(14, 2) not null,
  coste_unitario numeric(14, 2),
  descuento_pct numeric(14, 2) not null default 0
);

create index if not exists idx_sfl_factura on a3erp.staging_factura_lineas(factura_numero_erp);

-- ---------- Estado de la ingesta ----------
create table if not exists a3erp.estado (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Swap atómico ----------
create or replace function a3erp.aplicar_ventas(p_codigo_empresa text, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = a3erp, public
as $$
declare
  v_empresa uuid;
  v_borradas integer;
  v_insertadas integer;
  v_lineas integer;
begin
  select id into v_empresa from public.empresas e where e.codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no existe: %', p_codigo_empresa;
  end if;

  insert into public.comerciales (codigo_erp, nombre, empresa_id)
  select distinct s.comercial_codigo,
         coalesce(nullif(trim(s.comercial_nombre), ''), 'Sin nombre'),
         v_empresa
  from a3erp.staging_facturas s
  where s.empresa_codigo = p_codigo_empresa
    and s.fecha between p_desde and p_hasta
    and s.comercial_codigo is not null
  on conflict (codigo_erp, empresa_id) do nothing;

  insert into public.clientes (codigo_erp, nombre, empresa_id, created_at)
  select distinct s.cliente_codigo,
         coalesce(nullif(trim(s.cliente_nombre), ''), 'Sin nombre'),
         v_empresa, now()
  from a3erp.staging_facturas s
  where s.empresa_codigo = p_codigo_empresa
    and s.fecha between p_desde and p_hasta
    and s.cliente_codigo is not null
  on conflict (codigo_erp, empresa_id) do nothing;

  insert into public.articulos (codigo_erp, nombre, empresa_id, created_at)
  select distinct sl.articulo_codigo,
         coalesce(nullif(trim(sl.articulo_nombre), ''), 'Sin nombre'),
         v_empresa, now()
  from a3erp.staging_factura_lineas sl
  join a3erp.staging_facturas s on s.numero_erp = sl.factura_numero_erp
  where s.empresa_codigo = p_codigo_empresa
    and s.fecha between p_desde and p_hasta
    and sl.articulo_codigo is not null
  on conflict (codigo_erp, empresa_id) do nothing;

  delete from public.facturas f
  where f.empresa_id = v_empresa
    and f.fecha between p_desde and p_hasta
    and not exists (select 1 from public.facturas g where g.factura_anula_id = f.id);
  get diagnostics v_borradas = row_count;

  insert into public.facturas
    (id, numero_erp, empresa_id, fecha, tipo_documento, cliente_id, comercial_id,
     base_imponible, total, portes, descuento_pie, rappel_devengado, albaran_numero)
  select s.id, s.numero_erp, v_empresa, s.fecha, s.tipo_documento,
         cl.id, co.id,
         s.base_imponible, s.total, s.portes, s.descuento_pie, s.rappel_devengado,
         s.albaran_numero
  from a3erp.staging_facturas s
  left join public.clientes cl on cl.codigo_erp = s.cliente_codigo and cl.empresa_id = v_empresa
  left join public.comerciales co on co.codigo_erp = s.comercial_codigo and co.empresa_id = v_empresa
  where s.empresa_codigo = p_codigo_empresa
    and s.fecha between p_desde and p_hasta
  on conflict (numero_erp, empresa_id) do nothing;
  get diagnostics v_insertadas = row_count;

  update public.facturas f
  set factura_anula_id = a.id
  from a3erp.staging_facturas s
  join public.facturas a on a.numero_erp = s.factura_anula_numero and a.empresa_id = v_empresa
  where f.numero_erp = s.numero_erp
    and f.empresa_id = v_empresa
    and s.factura_anula_numero is not null;

  insert into public.factura_lineas
    (id, factura_id, articulo_id, cantidad, precio_unitario, coste_unitario, descuento_pct)
  select sl.id, f.id, a.id, sl.cantidad, sl.precio_unitario, sl.coste_unitario,
         sl.descuento_pct
  from a3erp.staging_factura_lineas sl
  join a3erp.staging_facturas s on s.numero_erp = sl.factura_numero_erp
  join public.facturas f on f.numero_erp = sl.factura_numero_erp and f.empresa_id = v_empresa
  left join public.articulos a on a.codigo_erp = sl.articulo_codigo and a.empresa_id = v_empresa
  where s.empresa_codigo = p_codigo_empresa
    and s.fecha between p_desde and p_hasta;
  get diagnostics v_lineas = row_count;

  delete from a3erp.staging_factura_lineas sl
  using a3erp.staging_facturas s
  where s.empresa_codigo = p_codigo_empresa
    and s.numero_erp = sl.factura_numero_erp
    and s.fecha between p_desde and p_hasta;

  delete from a3erp.staging_facturas
  where empresa_codigo = p_codigo_empresa and fecha between p_desde and p_hasta;

  return jsonb_build_object(
    'empresa', p_codigo_empresa,
    'desde', p_desde,
    'hasta', p_hasta,
    'facturas_replace', v_insertadas,
    'borradas', v_borradas,
    'lineas', v_lineas
  );
end;
$$;

-- ---------- RLS y permisos ----------
alter table a3erp.staging_facturas enable row level security;
alter table a3erp.staging_factura_lineas enable row level security;
alter table a3erp.estado enable row level security;

grant usage on schema a3erp to service_role;
grant select, insert, update, delete on a3erp.staging_facturas to service_role;
grant select, insert, update, delete on a3erp.staging_factura_lineas to service_role;
grant select, insert, update, delete on a3erp.estado to service_role;
grant execute on function a3erp.aplicar_ventas(text, date, date) to service_role;