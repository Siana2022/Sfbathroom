-- Maestros A3ERP · Proveedores (tabla + RPC de aplicación)
-- Fuente: A3ERP __PROVEED + __ORGANIZACION. Se aplica en Supabase SQL Editor. Idempotente.

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) not null,
  codigo_erp text not null,
  nombre text not null,
  nombre_fiscal text,
  cif text,
  direccion text,
  poblacion text,
  provincia text,
  pais text,
  telefono text,
  email text,
  plazo_suministro integer,
  created_at timestamptz not null default now(),
  constraint proveedores_codigo_empresa_key unique (codigo_erp, empresa_id)
);

create or replace function public.aplicar_proveedores_maestros(_empresa text, _proveedores jsonb)
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

  insert into public.proveedores (
    codigo_erp, nombre, nombre_fiscal, cif, direccion, poblacion, provincia, pais, telefono, email, plazo_suministro, empresa_id
  )
  select
    nullif(trim(p.codigo), ''),
    coalesce(nullif(trim(p.nombre), ''), trim(p.codigo)),
    nullif(trim(p."nombreFiscal"), ''),
    nullif(trim(p.cif), ''),
    nullif(trim(concat_ws(' ', nullif(trim(p.direccion1), ''), nullif(trim(p.direccion2), ''))), ''),
    nullif(trim(p.poblacion), ''),
    nullif(trim(p.provincia), ''),
    nullif(trim(p.pais), ''),
    nullif(trim(p.telefono), ''),
    nullif(trim(p.email), ''),
    p."plazoSuministro",
    _eid
  from jsonb_to_recordset(_proveedores) as p(
    codigo text,
    nombre text,
    "nombreFiscal" text,
    cif text,
    direccion1 text,
    direccion2 text,
    poblacion text,
    provincia text,
    pais text,
    telefono text,
    email text,
    "plazoSuministro" integer
  )
  where nullif(trim(p.codigo), '') is not null
  on conflict (codigo_erp, empresa_id) do update set
    nombre            = excluded.nombre,
    nombre_fiscal     = coalesce(excluded.nombre_fiscal, proveedores.nombre_fiscal),
    cif               = coalesce(excluded.cif, proveedores.cif),
    direccion         = coalesce(excluded.direccion, proveedores.direccion),
    poblacion         = coalesce(excluded.poblacion, proveedores.poblacion),
    provincia         = coalesce(excluded.provincia, proveedores.provincia),
    pais              = coalesce(excluded.pais, proveedores.pais),
    telefono          = coalesce(excluded.telefono, proveedores.telefono),
    email             = coalesce(excluded.email, proveedores.email),
    plazo_suministro  = coalesce(excluded.plazo_suministro, proveedores.plazo_suministro);
end;
$$;
