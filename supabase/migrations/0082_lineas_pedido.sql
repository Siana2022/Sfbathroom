-- Líneas de pedido (desde albaranes LINEALBA) y enlace al documento ERP.
alter table public.pedidos add column if not exists id_erp bigint;
create index if not exists idx_pedidos_id_erp on public.pedidos(empresa_id, id_erp);

alter table public.pedido_lineas add column if not exists codigo_articulo text;
alter table public.pedido_lineas add column if not exists descripcion text;
alter table public.pedido_lineas add column if not exists lote text;
alter table public.pedido_lineas add column if not exists numero_linea integer;

create or replace function public.reemplazar_lineas_pedido(p_codigo_empresa text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_ids bigint[];
  v_n integer := 0;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then raise exception 'empresa no encontrada: %', p_codigo_empresa; end if;

  select array_agg(distinct x.id_erp)
  into v_ids
  from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(id_erp bigint);

  if v_ids is null then return jsonb_build_object('lineas', 0); end if;

  delete from public.pedido_lineas pl
  using public.pedidos p
  where pl.pedido_id = p.id and p.empresa_id = v_empresa and p.id_erp = any(v_ids);

  insert into public.pedido_lineas (
    pedido_id, articulo_id, cantidad, precio_unitario, descuento_pct,
    codigo_articulo, descripcion, lote, numero_linea
  )
  select p.id, a.id, coalesce(x.cantidad, 0), coalesce(x.precio, 0), coalesce(x.descuento, 0),
         x.codigo_articulo, x.descripcion, x.lote, x.numero_linea
  from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(
    id_erp bigint, codigo_articulo text, descripcion text,
    cantidad numeric, precio numeric, descuento numeric, lote text, numero_linea integer
  )
  join public.pedidos p on p.empresa_id = v_empresa and p.id_erp = x.id_erp
  left join public.articulos a
    on a.empresa_id = v_empresa and btrim(a.codigo_erp) = btrim(x.codigo_articulo);

  get diagnostics v_n = row_count;
  return jsonb_build_object('lineas', v_n);
end;
$$;

revoke execute on function public.reemplazar_lineas_pedido(text, jsonb) from public, anon, authenticated;
grant execute on function public.reemplazar_lineas_pedido(text, jsonb) to service_role;
