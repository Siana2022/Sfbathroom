-- Enlace factura → pedido: comparación tolerante a espacios.
--
-- Algunos `numero_erp` se guardan con relleno a la izquierda/derecha (columnas
-- char de A3ERP). Se normaliza con btrim() en ambos lados. Mantiene los dos
-- formatos de 0047 (SERIE-NUMERO y solo número).
--
-- Idempotente. Se aplica después de 0047.

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
       btrim(f.numero_erp) = btrim(d ->> 'factura_numero')
       or btrim(f.numero_erp) = btrim(d ->> 'factura_numero_alt')
     );

  get diagnostics v_actualizadas = row_count;

  return jsonb_build_object('facturas_actualizadas', v_actualizadas);
end;
$$;

grant execute on function public.enlazar_fechas_pedido(text, jsonb) to service_role;
