-- Cobros y vencimientos de clientes, desde A3ERP (tabla CARTERA).
--
-- CARTERA tiene los vencimientos con su importe, lo cobrado y lo devuelto.
-- El pendiente es IMPORTE - IMPORTECOB - IMPORTEDEVANT.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create table if not exists public.cobros_cartera (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id),
  codigo_cliente text,
  num_cartera text,
  numero_documento text,
  fecha_factura date,
  fecha_vencimiento date,
  fecha_cobro date,
  importe numeric(14,2) not null default 0,
  importe_cobrado numeric(14,2) not null default 0,
  importe_devuelto numeric(14,2) not null default 0,
  pendiente numeric(14,2) not null default 0,
  es_dudoso boolean not null default false,
  actualizado timestamptz not null default now(),
  unique (empresa_id, num_cartera)
);

create index if not exists idx_cobros_cartera_empresa on public.cobros_cartera(empresa_id);
create index if not exists idx_cobros_cartera_vencimiento on public.cobros_cartera(empresa_id, fecha_vencimiento);
create index if not exists idx_cobros_cartera_cliente on public.cobros_cartera(cliente_id);

alter table public.cobros_cartera enable row level security;

drop policy if exists cobros_cartera_select on public.cobros_cartera;
create policy cobros_cartera_select on public.cobros_cartera for select using (auth.role() = 'authenticated');

drop policy if exists cobros_cartera_write on public.cobros_cartera;
create policy cobros_cartera_write on public.cobros_cartera for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create or replace function public.limpiar_cobros_cartera(p_codigo_empresa text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_borradas integer;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;
  delete from public.cobros_cartera where empresa_id = v_empresa;
  get diagnostics v_borradas = row_count;
  return jsonb_build_object('borradas', v_borradas);
end;
$$;

create or replace function public.insertar_cobros_cartera(p_codigo_empresa text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_ins integer;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  insert into public.cobros_cartera (
    empresa_id, cliente_id, codigo_cliente, num_cartera, numero_documento,
    fecha_factura, fecha_vencimiento, fecha_cobro,
    importe, importe_cobrado, importe_devuelto, pendiente, es_dudoso
  )
  select
    v_empresa,
    c.id,
    x.codigo_cliente,
    x.num_cartera,
    x.numero_documento,
    x.fecha_factura,
    x.fecha_vencimiento,
    x.fecha_cobro,
    x.importe,
    x.importe_cobrado,
    x.importe_devuelto,
    x.pendiente,
    x.es_dudoso
  from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(
    codigo_cliente text,
    num_cartera text,
    numero_documento text,
    fecha_factura date,
    fecha_vencimiento date,
    fecha_cobro date,
    importe numeric,
    importe_cobrado numeric,
    importe_devuelto numeric,
    pendiente numeric,
    es_dudoso boolean
  )
  left join public.clientes c
    on c.empresa_id = v_empresa and btrim(c.codigo_erp) = btrim(x.codigo_cliente)
  on conflict (empresa_id, num_cartera) do nothing;

  get diagnostics v_ins = row_count;
  return jsonb_build_object('insertadas', v_ins);
end;
$$;

revoke execute on function public.limpiar_cobros_cartera(text) from public, anon, authenticated;
revoke execute on function public.insertar_cobros_cartera(text, jsonb) from public, anon, authenticated;
grant execute on function public.limpiar_cobros_cartera(text) to service_role;
grant execute on function public.insertar_cobros_cartera(text, jsonb) to service_role;
