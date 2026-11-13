-- Coste real por lote (compras) y stock en mar (pedidos de compra pendientes).
--
-- Fuente A3ERP:
--   CABEALBC (cabecera albarán de compra, campo CAMBIO) + LINEALBA (líneas con
--   CODART, LOTE, PRECIO, UNIDADES).  coste_eur = PRECIO * CAMBIO.
--   CABEPEDC + LINEPEDI (pedidos de compra) para el stock en mar.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create table if not exists public.lotes_coste (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  articulo_codigo text not null,
  lote text not null default '',
  fecha date not null,
  unidades numeric(20,3) not null default 0,
  coste_unitario numeric(20,4) not null default 0,
  documento text not null default '',
  actualizado_at timestamptz not null default now(),
  unique (empresa_id, articulo_codigo, lote, fecha, documento)
);

create index if not exists idx_lotes_coste_empresa on public.lotes_coste(empresa_id);
create index if not exists idx_lotes_coste_articulo on public.lotes_coste(articulo_codigo, lote);

alter table public.lotes_coste enable row level security;

drop policy if exists lotes_coste_select on public.lotes_coste;
create policy lotes_coste_select on public.lotes_coste for select using (auth.role() = 'authenticated');

drop policy if exists lotes_coste_write on public.lotes_coste;
create policy lotes_coste_write on public.lotes_coste for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create table if not exists public.stock_en_mar (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  articulo_codigo text not null,
  articulo_nombre text,
  unidades numeric(20,3) not null default 0,
  pedidos integer not null default 0,
  actualizado_at timestamptz not null default now(),
  unique (empresa_id, articulo_codigo)
);

create index if not exists idx_stock_en_mar_empresa on public.stock_en_mar(empresa_id);

alter table public.stock_en_mar enable row level security;

drop policy if exists stock_en_mar_select on public.stock_en_mar;
create policy stock_en_mar_select on public.stock_en_mar for select using (auth.role() = 'authenticated');

drop policy if exists stock_en_mar_write on public.stock_en_mar;
create policy stock_en_mar_write on public.stock_en_mar for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

-- Reemplazo completo por empresa (mismo patrón que stock_almacen).
create or replace function public.reemplazar_lotes_coste(_empresa text, _filas jsonb)
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

  delete from public.lotes_coste where empresa_id = _eid;

  insert into public.lotes_coste (empresa_id, articulo_codigo, lote, fecha, unidades, coste_unitario, documento)
  select _eid,
         trim(f."articulo"),
         coalesce(trim(f."lote"), ''),
         f."fecha"::date,
         coalesce(f."unidades", 0),
         coalesce(f."coste", 0),
         coalesce(trim(f."documento"), '')
  from jsonb_to_recordset(_filas) as f(
    articulo text, lote text, fecha text, unidades numeric, coste numeric, documento text
  )
  where nullif(trim(f."articulo"), '') is not null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;

grant execute on function public.reemplazar_lotes_coste(text, jsonb) to service_role;

create or replace function public.reemplazar_stock_en_mar(_empresa text, _filas jsonb)
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

  delete from public.stock_en_mar where empresa_id = _eid;

  insert into public.stock_en_mar (empresa_id, articulo_codigo, articulo_nombre, unidades, pedidos)
  select _eid,
         trim(f."articulo"),
         nullif(trim(f."nombre"), ''),
         coalesce(f."unidades", 0),
         coalesce(f."pedidos", 0)
  from jsonb_to_recordset(_filas) as f(articulo text, nombre text, unidades numeric, pedidos integer)
  where nullif(trim(f."articulo"), '') is not null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;

grant execute on function public.reemplazar_stock_en_mar(text, jsonb) to service_role;
