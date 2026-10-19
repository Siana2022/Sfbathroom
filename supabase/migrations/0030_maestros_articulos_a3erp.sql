-- Maestros A3ERP · Artículos (ampliación de columnas + RPC de aplicación)
-- Fuente: A3ERP ARTICULO. Se aplica en Supabase SQL Editor. Idempotente.

alter table public.articulos add column if not exists precio_coste    numeric(14,4);
alter table public.articulos add column if not exists precio_base     numeric(14,4);
alter table public.articulos add column if not exists referencia      text;
alter table public.articulos add column if not exists codigo_barras   text;
alter table public.articulos add column if not exists peso            numeric(10,3);
alter table public.articulos add column if not exists volumen         numeric(10,3);

create or replace function public.aplicar_articulos_maestros(_empresa text, _articulos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _eid uuid;
begin
  select id into _eid from public.empresas where codigo = _empresa;
  if _eid is null then
    raise exception 'Empresa no encontrada: %', _empresa;
  end if;

  insert into public.articulos (
    codigo_erp, nombre, precio_coste, precio_base, referencia, codigo_barras, peso, volumen, empresa_id
  )
  select
    nullif(trim(a.codigo), ''),
    coalesce(nullif(trim(a.nombre), ''), trim(a.codigo)),
    a."precioCoste",
    a."precioBase",
    nullif(trim(a.referencia), ''),
    nullif(trim(a."codigoBarras"), ''),
    a.peso,
    a.volumen,
    _eid
  from jsonb_to_recordset(_articulos) as a(
    codigo text,
    nombre text,
    "precioCoste" numeric,
    "precioBase" numeric,
    referencia text,
    "codigoBarras" text,
    peso numeric,
    volumen numeric
  )
  where nullif(trim(a.codigo), '') is not null
  on conflict (codigo_erp, empresa_id) do update set
    nombre        = excluded.nombre,
    precio_coste  = coalesce(excluded.precio_coste, articulos.precio_coste),
    precio_base   = coalesce(excluded.precio_base,  articulos.precio_base),
    referencia    = coalesce(excluded.referencia,   articulos.referencia),
    codigo_barras = coalesce(excluded.codigo_barras, articulos.codigo_barras),
    peso          = coalesce(excluded.peso,         articulos.peso),
    volumen       = coalesce(excluded.volumen,      articulos.volumen);
end;
$$;
