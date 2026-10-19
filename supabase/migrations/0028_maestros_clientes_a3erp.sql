-- Maestros A3ERP · D3: clientes (ampliación de columnas + RPC de aplicación)
-- Fuente: A3ERP __CLIENTES (venta) + __ORGANIZACION (tercero: dirección, país, comercial)
-- Se aplica en Supabase SQL Editor. Idempotente.

alter table public.clientes add column if not exists nombre_fiscal text;
alter table public.clientes add column if not exists direccion      text;
alter table public.clientes add column if not exists poblacion      text;
alter table public.clientes add column if not exists telefono       text;
alter table public.clientes add column if not exists email          text;

create or replace function public.aplicar_clientes_maestros(_empresa text, _clientes jsonb)
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

  insert into public.clientes (
    codigo_erp, nombre, nombre_fiscal, direccion, poblacion, provincia,
    pais_facturacion, telefono, email, empresa_id, comercial_id
  )
  select
    nullif(trim(c.codigo), ''),
    coalesce(nullif(trim(c.nombre), ''), trim(c.codigo)),
    nullif(trim(c."nombreFiscal"), ''),
    nullif(trim(concat_ws(' ', nullif(trim(c.direccion1), ''), nullif(trim(c.direccion2), ''))), ''),
    nullif(trim(c.poblacion), ''),
    nullif(trim(c.provincia), ''),
    nullif(trim(c.pais), ''),
    nullif(trim(c.telefono), ''),
    nullif(trim(c.email), ''),
    _eid,
    (select cm.id from public.comerciales cm
       where cm.empresa_id = _eid and cm.codigo_erp = trim(c."comercialCodigo")
       limit 1)
  from jsonb_to_recordset(_clientes) as c(
    "empresaCodigo" text,
    codigo text,
    nombre text,
    "nombreFiscal" text,
    "direccion1" text,
    "direccion2" text,
    poblacion text,
    municipio text,
    provincia text,
    "codProvincia" text,
    "codPais" text,
    pais text,
    telefono text,
    fax text,
    email text,
    "comercialCodigo" text,
    "comercialNombre" text
  )
  where nullif(trim(c.codigo), '') is not null
  on conflict (codigo_erp, empresa_id) do update set
    nombre           = excluded.nombre,
    nombre_fiscal    = coalesce(excluded.nombre_fiscal,    clientes.nombre_fiscal),
    direccion        = coalesce(excluded.direccion,        clientes.direccion),
    poblacion        = coalesce(excluded.poblacion,        clientes.poblacion),
    provincia        = coalesce(excluded.provincia,        clientes.provincia),
    pais_facturacion = coalesce(excluded.pais_facturacion, clientes.pais_facturacion),
    telefono         = coalesce(excluded.telefono,         clientes.telefono),
    email            = coalesce(excluded.email,            clientes.email),
    comercial_id     = coalesce(excluded.comercial_id,     clientes.comercial_id);
end;
$$;
