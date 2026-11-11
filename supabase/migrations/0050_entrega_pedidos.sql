-- Sincroniza la fecha de entrega comprometida de los pedidos (CABEPEDV.FECENTREGA).
--
-- La tabla `pedidos` se carga desde fuera del repo y no trae esa fecha, así que
-- la cartera de entregas programadas no se podía calcular. El script
-- `enlazar-pedidos.mjs` resuelve el uuid de cada pedido y llama aquí.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.actualizar_entrega_pedidos(
  p_pares jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actualizados int := 0;
begin
  update public.pedidos p
     set fecha_promedida = nullif(d ->> 'fecha_prometida', '')::date
    from jsonb_array_elements(p_pares) d
   where p.id = (d ->> 'pedido_id')::uuid;

  get diagnostics v_actualizados = row_count;

  return jsonb_build_object('pedidos_actualizados', v_actualizados);
end;
$$;

grant execute on function public.actualizar_entrega_pedidos(jsonb) to service_role;
