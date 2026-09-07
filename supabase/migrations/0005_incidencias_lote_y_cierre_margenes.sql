-- 0005: incidencias por lote y plazo de resolución + cierre de márgenes a dirección/financiero
-- Decisiones Q29 y Q5 del cuestionario (docs/cuestionario-cliente.md).
--
-- NOTA SOBRE RLS EN VISTAS: PostgreSQL no permite CREATE POLICY sobre vistas (solo sobre
-- tablas). security_invoker = true garantiza que la vista usa los permisos del usuario
-- consultor (no del owner), de modo que las RLS de factura_lineas/articulos/compras se
-- aplican. La restricción por rol (solo admin/direccion/financiero) se aplica en la app:
-- lib/datos/role.ts + lib/datos/margen.ts (devuelve sinAcceso).

-- ---------- 1. Incidencias: lote/compra de origen y fecha de cierre ----------
alter table public.incidencias add column if not exists compra_id uuid references public.compras(id);
alter table public.incidencias add column if not exists fecha_cierre date;

create index if not exists idx_incidencias_compra on public.incidencias(compra_id);

-- ---------- 2. Cierre de márgenes: recrear la vista con security_invoker ----------
-- La vista original de 0001 no tenía security_invoker y corría con permisos del owner.
drop view if exists public.v_margen_por_articulo;

create view public.v_margen_por_articulo
with (security_invoker = true)
as
select
  a.id as articulo_id,
  a.codigo_erp,
  a.nombre as articulo,
  fa.nombre as familia,
  sum(fl.cantidad) as unidades_vendidas,
  sum(fl.importe) as importe_vendido,
  sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0)) as coste_total,
  sum(fl.importe) - sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0)) as margen_total,
  case when sum(fl.importe) > 0 then
    round(100 * (sum(fl.importe) - sum(fl.cantidad * coalesce(fl.coste_unitario, a.coste_unitario, 0))) / sum(fl.importe), 2)
  else null end as margen_pct
from public.factura_lineas fl
join public.articulos a on a.id = fl.articulo_id
left join public.familias_articulo fa on fa.id = a.familia_id
group by a.id, a.codigo_erp, a.nombre, fa.nombre;