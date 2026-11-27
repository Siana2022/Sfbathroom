-- Observaciones de cliente que vienen de A3ERP.
--
-- En A3ERP están en `__ORGANIZACION.OBSERVACIONES` (texto libre, un histórico con
-- las fechas escritas dentro). Se guardan tal cual: partirlas en interacciones
-- exigiría interpretar cuatro formatos de fecha distintos y no es fiable.
--
-- Idempotente: se puede pegar en el SQL Editor de Supabase más de una vez.

alter table public.clientes add column if not exists observaciones text;

comment on column public.clientes.observaciones is
  'Observaciones del cliente tal y como vienen de A3ERP (__ORGANIZACION.OBSERVACIONES).';

-- La RPC de carga de condiciones añade la observación. Se mantiene el valor
-- anterior si A3ERP no manda nada (DOT las tiene todas vacías).
create or replace function public.actualizar_clientes_credito(p_codigo_empresa text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_n integer := 0;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  update public.clientes c
  set forma_pago = x.forma_pago,
      forma_pago_codigo = x.forma_pago_codigo,
      documento_pago = x.documento_pago,
      tarifa_codigo = x.tarifa_codigo,
      dias_pago = x.dias_pago,
      riesgo_concedido = x.riesgo_concedido,
      riesgo_actual = x.riesgo_actual,
      observaciones = coalesce(x.observaciones, c.observaciones)
  from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(
    codigo text,
    forma_pago text,
    forma_pago_codigo text,
    documento_pago text,
    tarifa_codigo text,
    dias_pago integer,
    riesgo_concedido numeric,
    riesgo_actual numeric,
    observaciones text
  )
  where c.empresa_id = v_empresa and btrim(c.codigo_erp) = btrim(x.codigo);

  get diagnostics v_n = row_count;
  return jsonb_build_object('actualizados', v_n);
end;
$$;

revoke execute on function public.actualizar_clientes_credito(text, jsonb) from public, anon, authenticated;
grant execute on function public.actualizar_clientes_credito(text, jsonb) to service_role;
