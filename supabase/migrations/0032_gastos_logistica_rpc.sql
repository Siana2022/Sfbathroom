-- RPC para aplicar gastos de logística (transporte y aduanas)
create or replace function public.aplicar_gastos_logistica(_empresa text, _gastos jsonb)
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

  insert into public.gastos_logistica (
    empresa_id, fecha, numero_erp, proveedor_codigo, proveedor_nombre, categoria, base_imponible, total
  )
  select
    _eid,
    g.fecha::date,
    nullif(trim(g.numeroErp), ''),
    nullif(trim(g.proveedorCodigo), ''),
    nullif(trim(g.proveedorNombre), ''),
    g.categoria,
    coalesce(g.baseImponible, 0),
    coalesce(g.total, 0)
  from jsonb_to_recordset(_gastos) as g(
    fecha text,
    "numeroErp" text,
    "proveedorCodigo" text,
    "proveedorNombre" text,
    categoria text,
    "baseImponible" numeric,
    total numeric
  )
  where nullif(trim(g.numeroErp), '') is not null
    and nullif(trim(g.proveedorCodigo), '') is not null
  on conflict (numero_erp, proveedor_codigo, empresa_id) do update set
    base_imponible = excluded.base_imponible,
    total          = excluded.total,
    categoria      = excluded.categoria;
end;
$$;
