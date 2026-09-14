-- Migración 0010: Corrección de fórmulas y KPIs (auditoría externa)
--
-- Hallazgos que corrige:
-- #2: v_aging usa plazo_pactado_dias para calcular días de mora real
-- #7: v_aging incluye abonos (vinculados y sueltos) para netear saldo
-- Renombra dias_vencido → dias_mora para semántica correcta
--
-- Aplicar manualmente en Supabase SQL Editor antes de usar la app.

-- ========== v_aging ==========
drop view if exists public.v_aging;

create view public.v_aging as
with abonos_por_factura as (
  select
    f.factura_anula_id,
    sum(f.total) as abono_total
  from public.facturas f
  where f.tipo_documento = 'abono' and f.factura_anula_id is not null
  group by f.factura_anula_id
),
abonos_sueltos as (
  select
    f.cliente_id,
    f.empresa_id,
    f.id as factura_id,
    f.numero_erp,
    f.fecha,
    coalesce(f.total, 0) as importe,
    coalesce(f.total, 0) as pendiente,
    (current_date - (f.fecha + coalesce(cl.plazo_pactado_dias, 30))) as dias_mora
  from public.facturas f
  left join public.clientes cl on cl.id = f.cliente_id
  where f.tipo_documento = 'abono' and f.factura_anula_id is null
)
select
  f.id as factura_id,
  f.numero_erp,
  f.empresa_id,
  f.cliente_id,
  f.fecha,
  coalesce(f.total, 0) as importe,
  coalesce(f.total, 0) - coalesce(c.cobrado, 0) - coalesce(ab.abono_total, 0) as pendiente,
  (current_date - (f.fecha + coalesce(cl.plazo_pactado_dias, 30))) as dias_mora
from public.facturas f
left join public.clientes cl on cl.id = f.cliente_id
left join (
  select factura_id, sum(importe) as cobrado
  from public.cobros
  where not impagado
  group by factura_id
) c on c.factura_id = f.id
left join abonos_por_factura ab on ab.factura_anula_id = f.id
where f.tipo_documento in ('factura', 'nota_cargo')

union all

select * from abonos_sueltos;

alter view public.v_aging set (security_invoker = true);

-- ========== v_saldo_clientes ==========
drop view if exists public.v_saldo_clientes;

create view public.v_saldo_clientes as
select
  empresa_id,
  cliente_id,
  sum(case when dias_mora < 0 then pendiente else 0 end) as en_cartera,
  sum(case when dias_mora >= 0 and pendiente > 0 then pendiente else 0 end) as vencido,
  sum(pendiente) as saldo_total
from public.v_aging
group by empresa_id, cliente_id;

alter view public.v_saldo_clientes set (security_invoker = true);
