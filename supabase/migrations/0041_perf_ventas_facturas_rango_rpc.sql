-- 0041_perf_ventas_facturas_rango_rpc.sql
-- Rendimiento multiempresa (P-mult, paso 5). Complementa a ventas_anio (0040) para los módulos
-- que necesitan CABECERAS de factura en una ventana de fechas arbitraria (no un año natural),
-- p. ej. `clientes` (ventana móvil de ~730 días para actividad/retención) o actividad comercial.
--
-- Devuelve solo las cabeceras de factura del rango [p_desde, p_hasta] en UNA sola llamada, en
-- lugar de paginar `todasLasFilas(facturas)` de 1000 en 1000. Respeta la cartera del rol
-- (auth_role()/auth_comercial_id()), igual que 0038/0039/0040.

create or replace function public.ventas_facturas_rango(
  p_codigo_empresa text,
  p_desde date,
  p_hasta date
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
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id,
           'cliente_id', f.cliente_id,
           'comercial_id', f.comercial_id,
           'fecha', f.fecha,
           'tipo_documento', f.tipo_documento,
           'base_imponible', f.base_imponible,
           'total', f.total,
           'numero_erp', f.numero_erp
         )), '[]'::jsonb)
  into v_facturas
  from public.facturas f
  where f.empresa_id = v_empresa
    and f.fecha >= p_desde and f.fecha <= p_hasta
    and (v_puede_todo or f.comercial_id = v_com);

  return v_facturas;
end;
$$;

comment on function public.ventas_facturas_rango(text, date, date) is
  'Cabeceras de factura de una empresa en [p_desde, p_hasta] en una sola llamada, respetando la '
  'cartera del rol. Para módulos con ventana de fechas arbitraria (clientes, actividad, etc.).';

revoke execute on function public.ventas_facturas_rango(text, date, date) from public, anon;
grant execute on function public.ventas_facturas_rango(text, date, date) to authenticated;
