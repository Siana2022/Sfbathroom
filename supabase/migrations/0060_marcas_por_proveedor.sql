-- Asigna marca a los artículos a partir del proveedor (CODPRO de A3ERP).
--
-- A3ERP no tiene marca ni fabricante en ARTICULO, así que la marca se deduce de
-- una tabla de equivalencias proveedor → marca mantenida en la ingesta
-- (ingesta/a3erp/config/marcas-proveedor.json).
--
-- La función crea la marca si no existe y actualiza articulos.marca_id.
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.reemplazar_marcas_articulos(p_codigo_empresa text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_marca uuid;
  r record;
  n integer := 0;
  creadas integer := 0;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  for r in
    select x.codigo, x.marca
    from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(codigo text, marca text)
    where x.codigo is not null and x.marca is not null and btrim(x.marca) <> ''
  loop
    select id into v_marca from public.marcas where nombre = r.marca limit 1;
    if v_marca is null then
      insert into public.marcas (nombre) values (r.marca) returning id into v_marca;
      creadas := creadas + 1;
    end if;

    update public.articulos
    set marca_id = v_marca
    where empresa_id = v_empresa and codigo_erp = r.codigo;

    if found then n := n + 1; end if;
  end loop;

  return jsonb_build_object('actualizados', n, 'marcas_creadas', creadas);
end;
$$;

revoke execute on function public.reemplazar_marcas_articulos(text, jsonb) from public, anon, authenticated;
grant execute on function public.reemplazar_marcas_articulos(text, jsonb) to service_role;
