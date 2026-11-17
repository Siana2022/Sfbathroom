-- 0042_perf_ventas_filtrado_rpc.sql
-- Rendimiento (P-mult, paso 6). Arregla la lentitud de la pestaña de Facturación al aplicar un
-- filtro (cliente/comercial/familia/marca): hasta ahora, con filtros, la app abandonaba el
-- cálculo rápido y caía al camino antiguo (descargar facturas+líneas de 1-2 años y filtrar en
-- Node), lo que tardaba 10-15 s.
--
-- Este RPC devuelve, EN UNA sola llamada, las facturas que cumplen el filtro + todas sus líneas,
-- aplicando el filtro en SQL (incluido familia/marca por existencia de línea). Respeta la cartera
-- del rol (auth_role()/auth_comercial_id()). La agregación sigue haciéndose en Node en cada módulo
-- (mismos números); esto solo cambia la FUENTE de los datos filtrados.
--
-- Semántica idéntica a getFacturaIdsFiltradas (lib/datos/filtros.ts):
--   * cliente  -> facturas.cliente_id = p_cliente
--   * comercial-> facturas.comercial_id = p_comercial
--   * familia  -> la factura tiene AL MENOS una línea de un artículo de esa familia
--   * marca    -> idem con articulos.marca_id
--   * ventana  -> [p_desde, p_hasta] (el llamador pasa la ventana efectiva, ya con desde/hasta).

create or replace function public.ventas_filtrado(
  p_codigo_empresa text,
  p_desde date,
  p_hasta date,
  p_cliente uuid default null,
  p_comercial uuid default null,
  p_familia text default null,
  p_marca uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_facturas jsonb;
  v_lineas jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  create temporary table tmp_fact_filtrado on commit drop as
  select f.id, f.cliente_id, f.comercial_id, f.fecha, f.tipo_documento, f.base_imponible, f.total
  from public.facturas f
  where f.empresa_id = v_empresa
    and f.fecha >= p_desde and f.fecha <= p_hasta
    and (v_puede_todo or f.comercial_id = v_com)
    and (p_cliente is null or f.cliente_id = p_cliente)
    and (p_comercial is null or f.comercial_id = p_comercial)
    and (
      (p_familia is null and p_marca is null)
      or exists (
        select 1
        from public.factura_lineas fl
        join public.articulos a on a.id = fl.articulo_id
        where fl.factura_id = f.id
          and (p_familia is null or a.familia = p_familia)
          and (p_marca is null or public.factura_es_marca(f.id, p_marca))
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'cliente_id', cliente_id,
           'comercial_id', comercial_id,
           'fecha', fecha,
           'tipo_documento', tipo_documento,
           'base_imponible', base_imponible,
           'total', total
         )), '[]'::jsonb)
  into v_facturas
  from tmp_fact_filtrado;

  select coalesce(jsonb_agg(jsonb_build_object(
           'factura_id', fl.factura_id,
           'articulo_id', fl.articulo_id,
           'cantidad', fl.cantidad,
           'precio_unitario', fl.precio_unitario,
           'base_imponible', fl.base_imponible,
           'importe', fl.importe,
           'coste_unitario', fl.coste_unitario
         )), '[]'::jsonb)
  into v_lineas
  from public.factura_lineas fl
  join tmp_fact_filtrado t on t.id = fl.factura_id;

  return jsonb_build_object('facturas', v_facturas, 'lineas', v_lineas);
end;
$$;

comment on function public.ventas_filtrado(text, date, date, uuid, uuid, text, uuid) is
  'Facturas que cumplen el filtro (cliente/comercial/familia/marca) en [desde,hasta] + sus líneas, '
  'en una sola llamada, respetando la cartera del rol. Acelera la ruta con filtros de Facturación.';

revoke execute on function public.ventas_filtrado(text, date, date, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.ventas_filtrado(text, date, date, uuid, uuid, text, uuid) to authenticated;


-- 0044_perf_series_kpis_mensual.sql
-- Serie mensual (12 meses) del año en curso + año anterior, para el gráfico de evolución que se
-- despliega al pinchar un KPI en la pestaña Facturación. Devuelve, por mes, los ingredientes de
-- TODAS las métricas (neta, nº facturas, unidades y presupuesto) para el año actual y el previo,
-- de modo que el cliente deriva cada KPI (ticket = neta/facturas, precio = neta/unidades, etc.).
--
-- Respeta la cartera del rol y los MISMOS filtros que la pestaña (cliente/comercial/familia/marca),
-- con la misma semántica que getFacturaIdsFiltradas/ventas_filtrado: familia/marca seleccionan las
-- facturas que tienen al menos una línea de ese artículo, y la neta/unidades se agregan sobre esas
-- facturas completas. Así el gráfico cuadra con el valor del KPI de arriba.

create or replace function public.perf_series_kpis_mensual(
  p_codigo_empresa text,
  p_anio integer,
  p_cliente uuid default null,
  p_comercial uuid default null,
  p_familia text default null,
  p_marca uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_prev integer := p_anio - 1;
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_series jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  -- Facturas que cumplen el filtro en los dos ejercicios.
  create temporary table tmp_f on commit drop as
  select f.id,
         extract(year from f.fecha)::integer as ejercicio,
         extract(month from f.fecha)::integer as mes,
         f.tipo_documento,
         f.base_imponible
  from public.facturas f
  where f.empresa_id = v_empresa
    and f.fecha >= make_date(v_prev, 1, 1) and f.fecha <= make_date(p_anio, 12, 31)
    and (v_puede_todo or f.comercial_id = v_com)
    and (p_cliente is null or f.cliente_id = p_cliente)
    and (p_comercial is null or f.comercial_id = p_comercial)
    and (
      (p_familia is null and p_marca is null)
      or exists (
        select 1 from public.factura_lineas fl
        join public.articulos a on a.id = fl.articulo_id
        where fl.factura_id = f.id
          and (p_familia is null or a.familia = p_familia)
          and (p_marca is null or public.factura_es_marca(f.id, p_marca))
      )
    );

  with m as (
    select ejercicio, mes,
           sum(base_imponible) as neta,
           count(*) filter (where tipo_documento = 'factura') as nfact
    from tmp_f group by ejercicio, mes
  ),
  u as (
    select t.ejercicio, t.mes, coalesce(sum(fl.cantidad), 0) as unidades
    from tmp_f t join public.factura_lineas fl on fl.factura_id = t.id
    group by t.ejercicio, t.mes
  ),
  pres as (
    select mes, sum(importe) as imp
    from public.presupuesto
    where empresa_id = v_empresa and ejercicio = p_anio
      and (p_familia is null and p_marca is null)
      and (p_cliente is null or cliente_id = p_cliente)
      and (p_comercial is null or comercial_id = p_comercial)
    group by mes
  ),
  meses as (select generate_series(1, 12) as mes)
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', meses.mes,
           'neta_cur', coalesce(mc.neta, 0),
           'neta_prev', mp.neta,
           'facturas_cur', coalesce(mc.nfact, 0),
           'facturas_prev', coalesce(mp.nfact, 0),
           'unidades_cur', coalesce(uc.unidades, 0),
           'unidades_prev', coalesce(up.unidades, 0),
           'presupuesto_cur', coalesce(pr.imp, 0)
         ) order by meses.mes), '[]'::jsonb)
  into v_series
  from meses
  left join m mc on mc.mes = meses.mes and mc.ejercicio = p_anio
  left join m mp on mp.mes = meses.mes and mp.ejercicio = v_prev
  left join u uc on uc.mes = meses.mes and uc.ejercicio = p_anio
  left join u up on up.mes = meses.mes and up.ejercicio = v_prev
  left join pres pr on pr.mes = meses.mes;

  return v_series;
end;
$$;

comment on function public.perf_series_kpis_mensual(text, integer, uuid, uuid, text, uuid) is
  'Serie mensual (año actual + previo) de neta, nº facturas, unidades y presupuesto, respetando '
  'filtro y cartera. Alimenta el gráfico de evolución al pinchar un KPI en Facturación.';

revoke execute on function public.perf_series_kpis_mensual(text, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.perf_series_kpis_mensual(text, integer, uuid, uuid, text, uuid) to authenticated;
