-- ============================================================
-- SFBATHROOM BI · Ingesta A3ERP (0024): fix duplicación de líneas
-- ============================================================
-- Bug (crítico): en a3erp.aplicar_ventas el `delete from public.facturas`
-- protege (no borra) las facturas referenciadas por un abono vía
-- factura_anula_id. Como esas facturas no se borran, su cascade no limpia
-- factura_lineas, y el INSERT final vuelve a insertar TODAS las líneas del
-- rango con ids nuevos (randomUUID en el runner). Resultado: las líneas de
-- una factura anulada se acumulan una vez por noche mientras la factura está
-- dentro de la ventana móvil de 45 días. Infla unidades, margen y cross-sell.
--
-- Fix:
--   1) Borrar explícitamente las factura_lineas de TODAS las facturas del
--      rango (empresa) antes del insert, sin depender del cascade.
--   2) Refrescar también la CABECERA de las facturas protegidas: pasar el
--      `on conflict ... do nothing` a `do update set ...` (M1, evita cabeceras
--      "stale" de anuladas).
--
-- Se incluyen además dos funciones auxiliares (no se ejecutan solas):
--   * a3erp.contar_lineas_duplicadas()  -> diagnóstico de daño ya acumulado.
--   * a3erp.deduplicar_lineas_anuladas() -> reparación puntual (ver NOTA).
--
-- NOTA: la reparación AUTORITATIVA del daño acumulado es volver a correr la
-- ingesta en modo reconciliación (PERIODO_START→hoy) tras aplicar esta
-- migración: con el fix, el borrado por rango refresca también las anuladas.
-- deduplicar_lineas_anuladas() es una mitigación inmediata que colapsa filas
-- EXACTAMENTE iguales de facturas anuladas (podría unir líneas legítimas
-- idénticas; usar solo si no se puede reconciliar ya).
-- ============================================================

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
  v_lineas_borradas integer;
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

  -- Se conserva la protección de cabeceras anuladas (no borrar facturas
  -- referenciadas por un abono), pero ahora el INSERT de cabeceras actualiza
  -- las que ya existen (do update), y las líneas se recargan siempre por rango.
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
  on conflict (numero_erp, empresa_id) do update
    set fecha = excluded.fecha,
        tipo_documento = excluded.tipo_documento,
        cliente_id = excluded.cliente_id,
        comercial_id = excluded.comercial_id,
        base_imponible = excluded.base_imponible,
        total = excluded.total,
        portes = excluded.portes,
        descuento_pie = excluded.descuento_pie,
        rappel_devengado = excluded.rappel_devengado,
        albaran_numero = excluded.albaran_numero;
  get diagnostics v_insertadas = row_count;

  update public.facturas f
  set factura_anula_id = a.id
  from a3erp.staging_facturas s
  join public.facturas a on a.numero_erp = s.factura_anula_numero and a.empresa_id = v_empresa
  where f.numero_erp = s.numero_erp
    and f.empresa_id = v_empresa
    and s.factura_anula_numero is not null;

  -- FIX: borrar las líneas de TODAS las facturas del rango antes de reinsertar.
  -- Así las facturas protegidas (anuladas, que no se borran arriba) también
  -- refrescan sus líneas y no se acumulan duplicados noche a noche.
  delete from public.factura_lineas fl
  using public.facturas f
  where fl.factura_id = f.id
    and f.empresa_id = v_empresa
    and f.fecha between p_desde and p_hasta;
  get diagnostics v_lineas_borradas = row_count;

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
    'lineas_borradas', v_lineas_borradas,
    'lineas', v_lineas
  );
end;
$$;

-- ------------------------------------------------------------
-- Diagnóstico: facturas con líneas repetidas (daño ya acumulado)
-- ------------------------------------------------------------
create or replace function a3erp.contar_lineas_duplicadas()
returns table (
  factura_id uuid,
  numero_erp text,
  empresa text,
  lineas integer,
  repetidas integer
)
language sql
security definer
set search_path = a3erp, public
as $$
  select fl.factura_id,
         f.numero_erp,
         e.codigo,
         count(*)::int as lineas,
         (count(*) - count(distinct (
            fl.articulo_id,
            fl.cantidad,
            fl.precio_unitario,
            coalesce(fl.coste_unitario, -1),
            fl.descuento_pct,
            coalesce(fl.base_imponible, -1)
         )))::int as repetidas
  from public.factura_lineas fl
  join public.facturas f on f.id = fl.factura_id
  join public.empresas e on e.id = f.empresa_id
  group by fl.factura_id, f.numero_erp, e.codigo
  having count(*) > count(distinct (
            fl.articulo_id,
            fl.cantidad,
            fl.precio_unitario,
            coalesce(fl.coste_unitario, -1),
            fl.descuento_pct,
            coalesce(fl.base_imponible, -1)
         ))
  order by repetidas desc, numero_erp;
$$;

-- ------------------------------------------------------------
-- Reparación puntual del daño acumulado en facturas anuladas.
-- Colapsa filas EXACTAMENTE iguales (mismo factura/artículo/cantidad/
-- precio/coste/descuento/base), conservando una. Devuelve filas borradas.
-- Solo actúa sobre facturas referenciadas por un abono.
-- ------------------------------------------------------------
create or replace function a3erp.deduplicar_lineas_anuladas()
returns integer
language plpgsql
security definer
set search_path = a3erp, public
as $$
declare
  v_borradas integer;
begin
  with duplicadas as (
    select fl.id,
           row_number() over (
             partition by fl.factura_id, fl.articulo_id, fl.cantidad,
                          fl.precio_unitario, coalesce(fl.coste_unitario, -1),
                          fl.descuento_pct, coalesce(fl.base_imponible, -1)
             order by fl.id
           ) as rn
    from public.factura_lineas fl
    join public.facturas f on f.id = fl.factura_id
    where exists (select 1 from public.facturas g where g.factura_anula_id = f.id)
  )
  delete from public.factura_lineas
  where id in (select id from duplicadas where rn > 1);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

grant execute on function a3erp.aplicar_ventas(text, date, date) to service_role;
grant execute on function a3erp.contar_lineas_duplicadas() to service_role;
grant execute on function a3erp.deduplicar_lineas_anuladas() to service_role;
