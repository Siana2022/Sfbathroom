-- 0009: Edición manual de datos (CRUD admin).
-- 1) Políticas RLS de escritura para las tablas "operativas" que todavía no tenían
--    (todas las anteriores solo permitían select). Con esto el equipo con rol
--    admin/direccion (y almacen para stock) puede dar de alta, editar y borrar
--    cualquier registro desde la app o desde Supabase Table Editor.
-- 2) RPC admin_columnas_tabla(): metadatos de columnas (tipo, pk, FK) para que la
--    página /datos genere el formulario automáticamente.

-- ---------- 1. Políticas de escritura faltantes ----------

create policy facturas_write on public.facturas for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy factura_lineas_write on public.factura_lineas for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy pedido_lineas_write on public.pedido_lineas for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy compra_lineas_write on public.compra_lineas for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy stock_actual_write on public.stock_actual for all
  using (public.auth_role() in ('admin','direccion','almacen'))
  with check (public.auth_role() in ('admin','direccion','almacen'));

create policy stock_movimientos_write on public.stock_movimientos for all
  using (public.auth_role() in ('admin','direccion','almacen'))
  with check (public.auth_role() in ('admin','direccion','almacen'));

create policy marketing_canales_write on public.marketing_canales for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy marketing_inversion_write on public.marketing_inversion for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy ventas_semanales_write on public.ventas_semanales for all
  using (public.auth_role() in ('admin','direccion'))
  with check (public.auth_role() in ('admin','direccion'));

create policy financiero_cuentas_write on public.financiero_cuentas_anuales for all
  using (public.auth_role() in ('admin','direccion','financiero'))
  with check (public.auth_role() in ('admin','direccion','financiero'));

create policy financiero_kpis_write on public.financiero_kpis for all
  using (public.auth_role() in ('admin','direccion','financiero'))
  with check (public.auth_role() in ('admin','direccion','financiero'));

-- ---------- 2. RPC metadatos de columnas ----------
create or replace function public.admin_columnas_tabla(p_tabla text)
returns table (
  columna text,
  tipo text,
  not_null boolean,
  es_pk boolean,
  es_generado boolean,
  ref_tabla text
)
language sql
security definer
set search_path = public
as $$
  select
    a.attname::text,
    format_type(a.atttypid, a.atttypmod),
    a.attnotnull,
    (pk.indrelid is not null and a.attnum::int2 = any(pk.indkey::int2[])),
    (a.attidentity in ('a','d') or a.attgenerated = 's'),
    fk.ref_tabla
  from pg_attribute a
  left join (
    select i.indrelid, i.indkey
    from pg_index i
    where i.indisprimary
  ) pk on pk.indrelid = a.attrelid
  left join (
    select
      conf.conrelid,
      conf.conkey,
      cf.relname::text as ref_tabla
    from pg_constraint conf
    join pg_class cf on cf.oid = conf.confrelid
    where conf.contype = 'f'
  ) fk on fk.conrelid = a.attrelid and a.attnum::int2 = fk.conkey[1]
  where a.attrelid = ('public.' || p_tabla)::regclass
    and a.attnum > 0
    and not a.attisdropped
  order by a.attnum;
$$;

revoke all on function public.admin_columnas_tabla(text) from public;
grant execute on function public.admin_columnas_tabla(text) to authenticated;