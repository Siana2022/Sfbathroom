-- Stock real por artículo, almacén y lote (A3ERP STOCKALM + ARTICULO)
create table if not exists public.stock_almacen (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  articulo_codigo text not null,
  articulo_nombre text,
  almacen_codigo text not null default '',
  almacen_nombre text,
  lote text not null default '',
  unidades numeric(14,3) not null default 0,
  coste_medio numeric(14,4),
  fecha_caducidad date,
  ubicacion text,
  actualizado_at timestamptz not null default now(),
  unique (empresa_id, almacen_codigo, articulo_codigo, lote)
);

create index if not exists idx_stock_almacen_empresa on public.stock_almacen(empresa_id);
create index if not exists idx_stock_almacen_articulo on public.stock_almacen(articulo_codigo);
create index if not exists idx_stock_almacen_almacen on public.stock_almacen(almacen_codigo);

alter table public.stock_almacen enable row level security;

drop policy if exists stock_almacen_select on public.stock_almacen;
create policy stock_almacen_select on public.stock_almacen for select using (auth.role() = 'authenticated');

drop policy if exists stock_almacen_write on public.stock_almacen;
create policy stock_almacen_write on public.stock_almacen for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create or replace function public.reemplazar_stock_almacen(_empresa text, _filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  _eid uuid;
  _n integer;
begin
  select id into _eid from public.empresas where codigo = _empresa;
  if _eid is null then
    raise exception 'Empresa no encontrada: %', _empresa;
  end if;

  delete from public.stock_almacen where empresa_id = _eid;

  insert into public.stock_almacen (
    empresa_id, articulo_codigo, articulo_nombre, almacen_codigo, almacen_nombre,
    lote, unidades, coste_medio, fecha_caducidad, ubicacion
  )
  select
    _eid,
    trim(f."codigo"),
    nullif(trim(f."nombre"), ''),
    coalesce(nullif(trim(f."almacen"), ''), ''),
    nullif(trim(f."almacenNombre"), ''),
    coalesce(trim(f."lote"), ''),
    coalesce(f."unidades", 0),
    f."costeMedio",
    nullif(trim(f."fechaCaducidad"), '')::date,
    nullif(trim(f."ubicacion"), '')
  from jsonb_to_recordset(_filas) as f(
    codigo text,
    nombre text,
    almacen text,
    "almacenNombre" text,
    lote text,
    unidades numeric,
    "costeMedio" numeric,
    "fechaCaducidad" text,
    ubicacion text
  )
  where nullif(trim(f."codigo"), '') is not null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;
