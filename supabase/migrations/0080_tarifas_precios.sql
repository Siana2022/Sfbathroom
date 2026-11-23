-- Tarifas y precios especiales de A3ERP.
-- Idempotente. Se aplica en Supabase SQL Editor.

create table if not exists public.tarifas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  tipo text,
  unique (empresa_id, codigo)
);

create table if not exists public.precios_especiales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo_articulo text,
  codigo_cliente text,
  codigo_proveedor text,
  precio numeric(14,4) not null default 0,
  unidades numeric(14,2),
  moneda text,
  tipo_regla text,
  fecha_desde date,
  fecha_hasta date
);

create index if not exists idx_precios_empresa_articulo on public.precios_especiales(empresa_id, codigo_articulo);
create index if not exists idx_precios_empresa_cliente on public.precios_especiales(empresa_id, codigo_cliente);

alter table public.tarifas enable row level security;
alter table public.precios_especiales enable row level security;

drop policy if exists tarifas_select on public.tarifas;
create policy tarifas_select on public.tarifas for select using (auth.role() = 'authenticated');

drop policy if exists precios_select on public.precios_especiales;
create policy precios_select on public.precios_especiales for select using (auth.role() = 'authenticated');

create or replace function public.limpiar_tarifas(p_codigo_empresa text)
returns void language plpgsql security definer set search_path = public as $$
declare v_empresa uuid;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then raise exception 'empresa no encontrada: %', p_codigo_empresa; end if;
  delete from public.tarifas where empresa_id = v_empresa;
  delete from public.precios_especiales where empresa_id = v_empresa;
end;
$$;

create or replace function public.insertar_tarifas(p_codigo_empresa text, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid; v_ins integer;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then raise exception 'empresa no encontrada: %', p_codigo_empresa; end if;

  insert into public.tarifas (empresa_id, codigo, nombre, tipo)
  select v_empresa, x.codigo, x.nombre, x.tipo
  from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(codigo text, nombre text, tipo text)
  on conflict (empresa_id, codigo) do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('insertadas', v_ins);
end;
$$;

create or replace function public.insertar_precios_especiales(p_codigo_empresa text, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_empresa uuid; v_ins integer;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then raise exception 'empresa no encontrada: %', p_codigo_empresa; end if;

  insert into public.precios_especiales (
    empresa_id, codigo_articulo, codigo_cliente, codigo_proveedor,
    precio, unidades, moneda, tipo_regla, fecha_desde, fecha_hasta
  )
  select v_empresa, x.codigo_articulo, x.codigo_cliente, x.codigo_proveedor,
         x.precio, x.unidades, x.moneda, x.tipo_regla, x.fecha_desde, x.fecha_hasta
  from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(
    codigo_articulo text, codigo_cliente text, codigo_proveedor text,
    precio numeric, unidades numeric, moneda text, tipo_regla text, fecha_desde date, fecha_hasta date
  );
  get diagnostics v_ins = row_count;
  return jsonb_build_object('insertadas', v_ins);
end;
$$;

revoke execute on function public.limpiar_tarifas(text) from public, anon, authenticated;
revoke execute on function public.insertar_tarifas(text, jsonb) from public, anon, authenticated;
revoke execute on function public.insertar_precios_especiales(text, jsonb) from public, anon, authenticated;
grant execute on function public.limpiar_tarifas(text) to service_role;
grant execute on function public.insertar_tarifas(text, jsonb) to service_role;
grant execute on function public.insertar_precios_especiales(text, jsonb) to service_role;
