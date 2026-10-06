-- ============================================================
-- SFBATHROOM BI · Ingesta A3ERP: RPC públicas para el runner
-- (0020). La API de PostgREST solo expone el esquema public, así
-- que el runner habla con unas funciones envoltorio que hacen el
-- trabajo completo en un solo llamada atómica (security definer,
-- a través del esquema a3erp). No requiere exponer a3erp a la API.
-- ============================================================

-- Vuelca el rango en a3erp.staging_* y llama al swap atómico.
-- Registra además la última corrida en a3erp.estado.
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
     cantidad, precio_unitario, coste_unitario, descuento_pct)
  select (j->>'id')::uuid,
         j->>'factura_numero_erp',
         nullif(j->>'articulo_codigo', ''),
         nullif(j->>'articulo_nombre', ''),
         (j->>'cantidad')::numeric,
         (j->>'precio_unitario')::numeric,
         nullif(j->>'coste_unitario', '')::numeric,
         coalesce((j->>'descuento_pct')::numeric, 0)
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

-- Lectura de estado para el watchdog / reconciliación (por REST).
create or replace function public.leer_estado(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = a3erp, public
as $$
declare
  v jsonb;
begin
  select valor into v from a3erp.estado where clave = p_clave;
  return coalesce(v, '{}'::jsonb);
end;
$$;

grant execute on function public.cargar_ventas(text, date, date, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.leer_estado(text) to service_role;