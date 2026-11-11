-- 0039_perf_rpc_agregados.sql
-- Rendimiento multiempresa (P-mult, paso 3). Mueve a Postgres la agregación de la ruta más
-- pesada (portada + facturación). Hoy lib/datos/facturacion.ts descarga TODAS las filas de
-- `facturas` y `factura_lineas` de 1-2 años vía PostgREST (paginando de 1000 en 1000) y hace
-- los SUM/GROUP BY en Node → crece linealmente con el histórico. Estas RPC devuelven el
-- agregado ya calculado filtrando por empresa+año en SQL.
--
-- RLS / cartera: las funciones son SECURITY DEFINER (para poder leer la materializada, que no
-- tiene RLS), pero REPLICAN el filtro de cartera de la RLS de `facturas` usando
-- auth_role()/auth_comercial_id() (patrón 0001/0004/0038). Un rol 'comercial' solo agrega su
-- propia cartera; admin/direccion/financiero/lectura ven toda la empresa.
--
-- Semántica idéntica a la actual (ver facturacion.ts y 0026):
--   * neta         = SUM(base_imponible) de TODOS los tipos (factura+abono+nota_cargo).
--   * n_facturas   = COUNT solo de tipo 'factura'.
--   * abonos_y_notas = COUNT de tipo <> 'factura'.
--   * unidades     = unidades NETAS (líneas de factura+abono+nota_cargo; abonos en negativo).
--   * top_clientes = top 5 por SUM(base_imponible) de todos los tipos del año en curso.

-- ============================================================
-- perf_facturacion(empresa, año) → agregados de la portada/facturación
-- ============================================================
-- Series mensuales y totales se leen de la materializada mv_perf_facturacion_mensual (rápido,
-- refrescada a diario). abonos_y_notas y top_clientes se leen en vivo de `facturas` (consulta
-- de un año, barata con idx_facturas_empresa_(cliente_)fecha de 0037).
create or replace function public.perf_facturacion(p_codigo_empresa text, p_anio integer)
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
  v_neta numeric := 0;
  v_unidades numeric := 0;
  v_nfacturas numeric := 0;
  v_neta_prev numeric := 0;
  v_abonos integer := 0;
  v_top jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  -- Series + totales desde la materializada, re-agregando por mes/ejercicio con cartera.
  with mv as (
    select mes, ejercicio,
           sum(neta_total) as neta_total,
           sum(n_facturas) as n_facturas,
           sum(unidades)   as unidades
    from public.mv_perf_facturacion_mensual
    where empresa_id = v_empresa
      and ejercicio in (p_anio, v_prev)
      and (v_puede_todo or comercial_id = v_com)
    group by mes, ejercicio
  ),
  meses as (select generate_series(1, 12) as mes)
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'mes', m.mes,
        'neta', coalesce(cur.neta_total, 0),
        'unidades', coalesce(cur.unidades, 0),
        'facturas', coalesce(cur.n_facturas, 0),
        'neta_previo', prev.neta_total
      ) order by m.mes
    ), '[]'::jsonb),
    coalesce(sum(cur.neta_total), 0),
    coalesce(sum(cur.unidades), 0),
    coalesce(sum(cur.n_facturas), 0),
    coalesce(sum(prev.neta_total), 0)
  into v_series, v_neta, v_unidades, v_nfacturas, v_neta_prev
  from meses m
  left join mv cur  on cur.mes = m.mes  and cur.ejercicio = p_anio
  left join mv prev on prev.mes = m.mes and prev.ejercicio = v_prev;

  -- Abonos y notas (tipo <> 'factura') del año en curso, en vivo.
  select count(*) into v_abonos
  from public.facturas f
  where f.empresa_id = v_empresa
    and f.fecha >= make_date(p_anio, 1, 1)
    and f.fecha <= make_date(p_anio, 12, 31)
    and f.tipo_documento <> 'factura'
    and (v_puede_todo or f.comercial_id = v_com);

  -- Top 5 clientes por neta (todos los tipos) del año en curso, en vivo.
  with tc as (
    select f.cliente_id, sum(f.base_imponible) as neta
    from public.facturas f
    where f.empresa_id = v_empresa
      and f.fecha >= make_date(p_anio, 1, 1)
      and f.fecha <= make_date(p_anio, 12, 31)
      and f.cliente_id is not null
      and (v_puede_todo or f.comercial_id = v_com)
    group by f.cliente_id
    order by sum(f.base_imponible) desc nulls last
    limit 5
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('id', tc.cliente_id, 'nombre', coalesce(c.nombre, '—'), 'neta', coalesce(tc.neta, 0))
           order by tc.neta desc nulls last
         ), '[]'::jsonb)
  into v_top
  from tc
  left join public.clientes c on c.id = tc.cliente_id;

  return jsonb_build_object(
    'neta', v_neta,
    'unidades', v_unidades,
    'n_facturas', v_nfacturas,
    'abonos_y_notas', v_abonos,
    'neta_previo_total', v_neta_prev,
    'series', v_series,
    'top_clientes', v_top
  );
end;
$$;

comment on function public.perf_facturacion(text, integer) is
  'Agregados de facturación (neta, unidades, nº facturas, abonos, serie mensual, top clientes) '
  'por empresa y año, respetando la cartera del rol. Sustituye la agregación en Node de getFacturacion.';

revoke execute on function public.perf_facturacion(text, integer) from public, anon;
grant execute on function public.perf_facturacion(text, integer) to authenticated;

-- ============================================================
-- perf_variacion(empresa, año) → descomposición precio/volumen/mix + efecto clientes
-- ============================================================
-- Reproduce exactamente el cálculo de getVariacion() en Node: por artículo (precio=valor/ud)
-- y por cliente, comparando el año en curso con el anterior. Se agrega en SQL sobre las líneas
-- de ambos ejercicios en vez de descargarlas a Node.
create or replace function public.perf_variacion(p_codigo_empresa text, p_anio integer)
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
  v_delta numeric; v_precio numeric; v_resta numeric;
  v_uprev numeric; v_uact numeric; v_vprev numeric;
  v_pmprev numeric; v_volumen numeric; v_mix numeric;
  v_nuevos numeric; v_perdidos_raw numeric; v_existentes numeric;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  create temporary table tmp_lin on commit drop as
  select fl.articulo_id, f.cliente_id,
         (extract(year from f.fecha)::integer = p_anio) as es_actual,
         fl.cantidad::numeric as cantidad,
         fl.base_imponible::numeric as base_imponible
  from public.facturas f
  join public.factura_lineas fl on fl.factura_id = f.id
  where f.empresa_id = v_empresa
    and f.fecha >= make_date(v_prev, 1, 1)
    and f.fecha <= make_date(p_anio, 12, 31)
    and fl.base_imponible is not null
    and fl.base_imponible <> 0
    and (v_puede_todo or f.comercial_id = v_com);

  -- Agregado por artículo → precio/volumen/mix.
  with art as (
    select articulo_id,
      coalesce(sum(cantidad) filter (where not es_actual), 0) as u0,
      coalesce(sum(cantidad) filter (where es_actual), 0) as u1,
      coalesce(sum(base_imponible) filter (where not es_actual), 0) as v0,
      coalesce(sum(base_imponible) filter (where es_actual), 0) as v1
    from tmp_lin
    where articulo_id is not null
    group by articulo_id
  )
  select
    coalesce(sum(v1 - v0), 0),
    coalesce(sum(((case when u1 > 0 then v1 / u1 else 0 end) - (case when u0 > 0 then v0 / u0 else 0 end)) * u1), 0),
    coalesce(sum((u1 - u0) * (case when u0 > 0 then v0 / u0 else 0 end)), 0),
    coalesce(sum(u0), 0),
    coalesce(sum(u1), 0),
    coalesce(sum(v0), 0)
  into v_delta, v_precio, v_resta, v_uprev, v_uact, v_vprev
  from art;

  v_pmprev := case when v_uprev > 0 then v_vprev / v_uprev else 0 end;
  v_volumen := (v_uact - v_uprev) * v_pmprev;
  v_mix := v_resta - v_volumen;

  -- Agregado por cliente → efecto clientes (nuevos / perdidos / existentes).
  with cli as (
    select cliente_id,
      coalesce(sum(base_imponible) filter (where not es_actual), 0) as prev,
      coalesce(sum(base_imponible) filter (where es_actual), 0) as act
    from tmp_lin
    where cliente_id is not null
    group by cliente_id
  )
  select
    coalesce(sum(act) filter (where prev = 0 and act <> 0), 0),
    coalesce(sum(prev) filter (where act = 0 and prev <> 0), 0),
    coalesce(sum(act - prev) filter (where not (prev = 0 and act <> 0) and not (act = 0 and prev <> 0)), 0)
  into v_nuevos, v_perdidos_raw, v_existentes
  from cli;

  return jsonb_build_object(
    'delta', v_delta,
    'precio', v_precio,
    'volumen', v_volumen,
    'mix', v_mix,
    'efecto_clientes', jsonb_build_object(
      'nuevos', v_nuevos,
      'perdidos', -v_perdidos_raw,
      'existentes', v_existentes
    )
  );
end;
$$;

comment on function public.perf_variacion(text, integer) is
  'Descomposición de la variación interanual (precio/volumen/mix) y efecto clientes '
  '(nuevos/perdidos/existentes) por empresa y año, respetando la cartera del rol. '
  'Sustituye la agregación en Node de getVariacion.';

revoke execute on function public.perf_variacion(text, integer) from public, anon;
grant execute on function public.perf_variacion(text, integer) to authenticated;
