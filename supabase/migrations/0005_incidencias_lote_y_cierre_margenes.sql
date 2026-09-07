-- 0005: incidencias por lote y plazo de resolución + cierre de márgenes a dirección/financiero
-- Decisiones Q29 y Q5 del cuestionario (docs/cuestionario-cliente.md).

-- ---------- 1. Incidencias: lote/compra de origen y fecha de cierre ----------
alter table public.incidencias add column if not exists compra_id uuid references public.compras(id);
alter table public.incidencias add column if not exists fecha_cierre date;

create index if not exists idx_incidencias_compra on public.incidencias(compra_id);

-- ---------- 2. Cierre de márgenes: la vista de 0001 se creó sin security_invoker ----------
-- Sin security_invoker la vista corre con permisos del owner y expone costes/margen a cualquier
-- rol autenticado. Se recrea con security_invoker (hereda la RLS de factura_lineas/articulos)
-- y deja de ser visible salvo para admin/direccion/financiero.
drop view if exists public.v_margen_por_articulo;

create view public.v_margen_por_articulo as
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
group by a.id, a.codigo_erp, a.nombre, fa.nombre
with (security_invoker = true);

alter view public.v_margen_por_articulo enable row level security;

create policy v_margen_select on public.v_margen_por_articulo for select using (
  public.auth_role() in ('admin','direccion','financiero')
);

-- ---------- 3. Tierras de seguridad: lecturas que dependen del coste, mismo criterio ----------
-- Compras/compra_lineas ya estaban restringidas (0003). Añadimos aquí la vista de coste por
-- lote por si un rol con acceso a stock la consultara: solo dirección/financiero.
alter view public.v_coste_completo_por_lote enable row level security;

create policy v_coste_lote_select on public.v_coste_completo_por_lote for select using (
  public.auth_role() in ('admin','direccion','financiero')
);

-- Nota: `articulos.coste_unitario` y `factura_lineas.coste_unitario` siguen legibles por los
-- roles con acceso a esos datos (lectura, comercial sobre lo suyo). La app bloquea el margen
-- por rol en el servidor (ver lib/datos/margen.ts). Si se exige cerrar a nivel de base,
-- habría que separar roles BD (cambio mayor) — documentado en tareas-pendientes.md.