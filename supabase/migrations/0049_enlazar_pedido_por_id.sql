-- Enlace factura → pedido por id de factura.
--
-- Evita depender del formato de `numero_erp`: el script `enlazar-pedidos.mjs`
-- descarga los números reales de Supabase, empareja en memoria y envía aquí el
-- uuid de cada factura. El update es exacto por clave primaria.
--
-- Idempotente. Se aplica después de 0046.

create or replace function public.enlazar_fechas_pedido_por_id(
  p_pares jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actualizadas int := 0;
begin
  update public.facturas f
     set pedido_fecha = (d ->> 'pedido_fecha')::date,
         pedido_entrega = nullif(d ->> 'pedido_entrega', '')::date
    from jsonb_array_elements(p_pares) d
   where f.id = (d ->> 'factura_id')::uuid;

  get diagnostics v_actualizadas = row_count;

  return jsonb_build_object('facturas_actualizadas', v_actualizadas);
end;
$$;

grant execute on function public.enlazar_fechas_pedido_por_id(jsonb) to service_role;
