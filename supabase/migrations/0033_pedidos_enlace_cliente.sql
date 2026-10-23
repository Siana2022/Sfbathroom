-- Pedidos A3ERP · enlace con clientes y fecha de entrada
-- La ingesta de pedidos (CABEPEDV) graba cliente_codigo y fecha, pero el resto
-- de la app necesita cliente_id y fecha_entrada. Se rellenan aquí y se
-- mantienen automáticamente con un trigger para cualquier ingesta futura.
-- Idempotente. Se aplica en Supabase SQL Editor.

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_erp text not null,
  serie text,
  fecha date not null,
  cliente_codigo text,
  cliente_nombre text,
  cliente_id uuid references public.clientes(id),
  estado text,
  situacion text,
  base_imponible numeric(14,2),
  total numeric(14,2),
  fecha_entrada date,
  fecha_prometida date,
  empresa_id uuid not null references public.empresas(id),
  created_at timestamptz not null default now(),
  constraint pedidos_serie_numero_empresa_key unique (serie, numero_erp, empresa_id)
);

alter table public.pedidos add column if not exists cliente_id uuid references public.clientes(id);
alter table public.pedidos add column if not exists fecha_entrada date;
alter table public.pedidos add column if not exists fecha_prometida date;

update public.pedidos p
set cliente_id = c.id
from public.clientes c
where p.cliente_id is null
  and c.empresa_id = p.empresa_id
  and c.codigo_erp = trim(p.cliente_codigo);

update public.pedidos
set fecha_entrada = fecha
where fecha_entrada is null;

create index if not exists idx_pedidos_cliente on public.pedidos(cliente_id);
create index if not exists idx_pedidos_fecha_entrada on public.pedidos(fecha_entrada);
create index if not exists idx_pedidos_fecha on public.pedidos(fecha);

create or replace function public.pedidos_enlazar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cliente_id is null and new.cliente_codigo is not null then
    select id into new.cliente_id
    from public.clientes
    where empresa_id = new.empresa_id
      and codigo_erp = trim(new.cliente_codigo)
    limit 1;
  end if;
  if new.fecha_entrada is null then
    new.fecha_entrada := new.fecha;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_enlazar_cliente on public.pedidos;
create trigger trg_pedidos_enlazar_cliente
before insert or update on public.pedidos
for each row execute function public.pedidos_enlazar_cliente();

alter table public.pedidos enable row level security;
