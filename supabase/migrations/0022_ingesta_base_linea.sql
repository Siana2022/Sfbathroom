-- ============================================================
-- SFBATHROOM BI · Ingesta A3ERP: base imponible por línea
-- (0022). El Neto del analítico de A3ERP se calcula por línea
-- (Σ ROUND(LINEFACT.BASEMONEDA, 2)) y el loader lo guarda ahora
-- en factura_lineas.base_imponible. El documento (facturas).
-- base_imponible ya llega calculado por el runner como suma de
-- sus líneas; aquí solo se persiste el valor por línea.
-- ============================================================

alter table a3erp.staging_factura_lineas
  add column if not exists base_imponible numeric(14, 2);

alter table public.factura_lineas
  add column if not exists base_imponible numeric(14, 2);

comment on column public.factura_lineas.base_imponible is
  'Base imponible real de la línea (LINEFACT.BASEMONEDA) con todos los descuentos aplicados (DESC1..3). El Neto del analítico de A3ERP es la suma de este valor por línea.';

-- ---------- aplicar_ventas: persiste la base por línea ----------
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
    (id, factura_id, articulo_id, cantidad, precio_unitario, coste_unitario, descuento_pct, base_imponible)
  select sl.id, f.id, a.id, sl.cantidad, sl.precio_unitario, sl.coste_unitario,
         sl.descuento_pct, sl.base_imponible
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

-- ---------- cargar_ventas: vuelca la base por línea al staging ----------
create or replace function public.cargar_ventas(
  p_codigo_empresa text,
  p_desde date,
  p_hasta date,
  p_facturas jsonb,
  p_lineas jsonb,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = a3erp, public
as $$
declare
  v_res jsonb;
begin
  delete from a3erp.staging_factura_lineas sl
  using a3erp.staging_facturas s
  where s.empresa_codigo = p_codigo_empresa
    and s.fecha between p_desde and p_hasta
    and s.numero_erp = sl.factura_numero_erp;

  delete from a3erp.staging_facturas
  where empresa_codigo = p_codigo_empresa and fecha between p_desde and p_hasta;

  insert into a3erp.staging_facturas
    (id, numero_erp, empresa_codigo, fecha, tipo_documento,
     cliente_codigo, cliente_nombre, comercial_codigo, comercial_nombre,
     base_imponible, total, portes, descuento_pie, rappel_devengado,
     albaran_numero, factura_anula_numero)
  select (j->>'id')::uuid,
         j->>'numero_erp',
         p_codigo_empresa,
         (j->>'fecha')::date,
         j->>'tipo_documento',
         nullif(j->>'cliente_codigo', ''),
         nullif(j->>'cliente_nombre', ''),
         nullif(j->>'comercial_codigo', ''),
         nullif(j->>'comercial_nombre', ''),
         (j->>'base_imponible')::numeric,
         (j->>'total')::numeric,
         coalesce((j->>'portes')::numeric, 0),
         coalesce((j->>'descuento_pie')::numeric, 0),
         coalesce((j->>'rappel_devengado')::numeric, 0),
         nullif(j->>'albaran_numero', ''),
         nullif(j->>'factura_anula_numero', '')
  from jsonb_array_elements(p_facturas) j;

  insert into a3erp.staging_factura_lineas
    (id, factura_numero_erp, articulo_codigo, articulo_nombre,
     cantidad, precio_unitario, coste_unitario, descuento_pct, base_imponible)
  select (j->>'id')::uuid,
         j->>'factura_numero_erp',
         nullif(j->>'articulo_codigo', ''),
         nullif(j->>'articulo_nombre', ''),
         (j->>'cantidad')::numeric,
         (j->>'precio_unitario')::numeric,
         nullif(j->>'coste_unitario', '')::numeric,
         coalesce((j->>'descuento_pct')::numeric, 0),
         (j->>'base_imponible')::numeric
  from jsonb_array_elements(p_lineas) j;

  select a3erp.aplicar_ventas(p_codigo_empresa, p_desde, p_hasta) into v_res;

  insert into a3erp.estado (clave, valor, updated_at)
  values ('ventas', jsonb_build_object(
     'ultima',
     coalesce(p_meta, '{}'::jsonb)
       || jsonb_build_object(
            'empresa', p_codigo_empresa,
            'desde', to_char(p_desde, 'YYYY-MM-DD'),
            'hasta', to_char(p_hasta, 'YYYY-MM-DD'),
            'resultado', v_res,
            'firmado', to_char(now(), 'YYYY-MM-DD HH24:MI:SS TZ')
          )
  ), now())
  on conflict (clave) do update set valor = excluded.valor, updated_at = now();

  return v_res;
end;
$$;

grant execute on function public.cargar_ventas(text, date, date, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.leer_estado(text) to service_role;