-- Enlace factura → pedido para medir el ciclo pedido→factura.
--
-- A3ERP guarda el pedido de origen en LINEFACT.IDPEDV. La ingesta lo lee de SQL
-- Server y lo envía aquí: no se toca la tabla `pedidos`, se guardan las fechas en
-- la propia factura, que es lo único necesario para calcular el plazo:
--   pedido_fecha   = CABEPEDV.FECHA     (fecha de registro del pedido)
--   pedido_entrega = CABEPEDV.FECENTREGA (fecha de entrega comprometida)
--
-- Idempotente. Se aplica en Supabase SQL Editor.

alter table public.facturas add column if not exists pedido_fecha date;
alter table public.facturas add column if not exists pedido_entrega date;

create index if not exists idx_facturas_pedido_fecha
  on public.facturas (empresa_id, pedido_fecha)
  where pedido_fecha is not null;

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
     and f.numero_erp = d ->> 'factura_numero';

  get diagnostics v_actualizadas = row_count;

  return jsonb_build_object('facturas_actualizadas', v_actualizadas);
end;
$$;

grant execute on function public.enlazar_fechas_pedido(text, jsonb) to service_role;
