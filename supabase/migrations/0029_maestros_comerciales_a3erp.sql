-- Maestros A3ERP · D3: comerciales desde REPRESEN
-- Fuente: A3ERP REPRESEN (32 filas en SF). Se aplica en Supabase SQL Editor. Idempotente.
-- Crea el RPC que llama el runner maestros antes de aplicar los clientes,
-- para que los CODREP de __ORGANIZACION tengan donde resolver su comercial_id.

create or replace function public.aplicar_comerciales_maestros(_empresa text, _comerciales jsonb)
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

  insert into public.comerciales (codigo_erp, nombre, empresa_id)
  select
    nullif(trim(x.codigo), ''),
    coalesce(nullif(trim(x.nombre), ''), trim(x.codigo)),
    _eid
  from jsonb_to_recordset(_comerciales) as x(codigo text, nombre text)
  where nullif(trim(x.codigo), '') is not null
  on conflict (codigo_erp, empresa_id) do update set
    nombre = excluded.nombre;
end;
$$;
