-- Enlace factura → pedido: tolerante al formato del número de factura.
--
-- 0046 comparaba `facturas.numero_erp` con el compuesto SERIE-NUMDOC. Si la
-- tabla guarda solo el número (o al revés), no casaba nada y el enlace salía
-- con 0 actualizaciones. Ahora se aceptan los dos formatos que envía la ingesta:
--   factura_numero      = "P26-944"  (serie-número)
--   factura_numero_alt  = "944"      (solo número)
--
-- Idempotente. Se aplica en Supabase SQL Editor después de 0046.

create or replace function public.enlazar_fechas_pedido(
  p_codigo_empresa text,
  p_pares jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_actualizadas int := 0;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  update public.facturas f
     set pedido_fecha = (d ->> 'pedido_fecha')::date,
         pedido_entrega = nullif(d ->> 'pedido_entrega', '')::date
    from jsonb_array_elements(p_pares) d
   where f.empresa_id = v_empresa
     and (
       f.numero_erp = d ->> 'factura_numero'
       or f.numero_erp = d ->> 'factura_numero_alt'
     );

  get diagnostics v_actualizadas = row_count;

  return jsonb_build_object('facturas_actualizadas', v_actualizadas);
end;
$$;

grant execute on function public.enlazar_fechas_pedido(text, jsonb) to service_role;
