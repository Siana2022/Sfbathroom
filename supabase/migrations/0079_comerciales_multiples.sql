-- Varios comerciales de A3ERP por usuario.
create table if not exists public.profiles_comerciales (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  comercial_id uuid not null references public.comerciales(id) on delete cascade,
  primary key (profile_id, comercial_id)
);

insert into public.profiles_comerciales (profile_id, comercial_id)
select id, comercial_id from public.profiles where comercial_id is not null
on conflict do nothing;

alter table public.profiles_comerciales enable row level security;

drop policy if exists profiles_comerciales_select on public.profiles_comerciales;
create policy profiles_comerciales_select on public.profiles_comerciales for select using (
  profile_id = auth.uid() or public.auth_role() in ('admin','direccion')
);

create or replace function public.es_mi_comercial(p_comercial uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles_comerciales pc
    where pc.profile_id = auth.uid() and pc.comercial_id = p_comercial
  ) or exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.comercial_id = p_comercial
  );
$$;

revoke execute on function public.es_mi_comercial(uuid) from public, anon;
grant execute on function public.es_mi_comercial(uuid) to authenticated;

-- Políticas: sustituir "comercial_id = auth_comercial_id()" por pertenencia.
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists facturas_select on public.facturas;
create policy facturas_select on public.facturas for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists factura_lineas_select on public.factura_lineas;
create policy factura_lineas_select on public.factura_lineas for select using (
  exists (
    select 1 from public.facturas f
    where f.id = factura_lineas.factura_id
      and (
        public.auth_role() in ('admin','direccion','financiero','lectura')
        or (public.auth_role() = 'comercial' and public.es_mi_comercial(f.comercial_id))
      )
  )
);

drop policy if exists pedidos_select on public.pedidos;
create policy pedidos_select on public.pedidos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      public.es_mi_comercial(comercial_id)
      or cliente_id in (select c.id from public.clientes c where public.es_mi_comercial(c.comercial_id))
    )
  )
);

drop policy if exists incidencias_select on public.incidencias;
create policy incidencias_select on public.incidencias for select using (
  public.auth_role() in ('admin','direccion','financiero')
  or (
    public.auth_role() = 'comercial'
    and exists (
      select 1 from public.clientes cl
      where cl.id = incidencias.cliente_id and public.es_mi_comercial(cl.comercial_id)
    )
  )
);

drop policy if exists presupuesto_select on public.presupuesto;
create policy presupuesto_select on public.presupuesto for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists agenda_select on public.agenda;
create policy agenda_select on public.agenda for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists agenda_insert on public.agenda;
create policy agenda_insert on public.agenda for insert with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists agenda_update on public.agenda;
create policy agenda_update on public.agenda for update using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists agenda_delete on public.agenda;
create policy agenda_delete on public.agenda for delete using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists agenda_notas_select on public.agenda_notas;
create policy agenda_notas_select on public.agenda_notas for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists agenda_notas_insert on public.agenda_notas;
create policy agenda_notas_insert on public.agenda_notas for insert with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists agenda_notas_delete on public.agenda_notas;
create policy agenda_notas_delete on public.agenda_notas for delete using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists cobros_cartera_select on public.cobros_cartera;
create policy cobros_cartera_select on public.cobros_cartera for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion')
  or (
    public.auth_role() = 'comercial'
    and exists (
      select 1 from public.clientes c
      where c.id = cobros_cartera.cliente_id and public.es_mi_comercial(c.comercial_id)
    )
  )
);

drop policy if exists objetivos_comercial_select on public.objetivos_comercial;
create policy objetivos_comercial_select on public.objetivos_comercial for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists clientes_contactos_select on public.clientes_contactos;
create policy clientes_contactos_select on public.clientes_contactos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c where c.id = clientes_contactos.cliente_id and public.es_mi_comercial(c.comercial_id)
  ))
);

drop policy if exists clientes_contactos_write on public.clientes_contactos;
create policy clientes_contactos_write on public.clientes_contactos for all using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c where c.id = clientes_contactos.cliente_id and public.es_mi_comercial(c.comercial_id)
  ))
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and exists (
    select 1 from public.clientes c where c.id = clientes_contactos.cliente_id and public.es_mi_comercial(c.comercial_id)
  ))
);

drop policy if exists alertas_silenciadas_select on public.alertas_silenciadas;
create policy alertas_silenciadas_select on public.alertas_silenciadas for select using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists alertas_silenciadas_insert on public.alertas_silenciadas;
create policy alertas_silenciadas_insert on public.alertas_silenciadas for insert with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists alertas_silenciadas_delete on public.alertas_silenciadas;
create policy alertas_silenciadas_delete on public.alertas_silenciadas for delete using (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);

drop policy if exists clientes_update_comercial on public.clientes;
create policy clientes_update_comercial on public.clientes for update using (
  public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id)
) with check (
  public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id)
);



-- Marca = grupo de comercial. STARBATH agrupa los comerciales cuyo nombre lleva
-- STARBATH; el resto de comerciales es la marca de la propia empresa.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.factura_es_marca(p_factura uuid, p_marca uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_marca is null then true
    when (select upper(nombre) from public.marcas where id = p_marca) like '%STARBATH%' then
      exists (
        select 1 from public.facturas f
        join public.comerciales c on c.id = f.comercial_id
        where f.id = p_factura and upper(c.nombre) like '%STARBATH%'
      )
    else
      not exists (
        select 1 from public.facturas f
        join public.comerciales c on c.id = f.comercial_id
        where f.id = p_factura and upper(c.nombre) like '%STARBATH%'
      )
  end;
$$;

revoke execute on function public.factura_es_marca(uuid, uuid) from public, anon;
grant execute on function public.factura_es_marca(uuid, uuid) to authenticated;

-- Una marca por empresa (mismo nombre que la empresa) + STARBATH.
insert into public.marcas (nombre)
select nombre from public.empresas
on conflict (nombre) do nothing;

insert into public.marcas (nombre) values ('STARBATH')
on conflict (nombre) do nothing;



-- Actividad y margen por cliente: aceptan los filtros de la página.
--
-- Igual que en los rankings de Facturación, si el usuario filtra por cliente,
-- comercial, familia o marca, los KPIs de Comportamiento de cliente deben
-- responder al mismo filtro.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.clientes_actividad(
  p_codigo_empresa text,
  p_anio integer,
  p_cliente uuid default null,
  p_comercial uuid default null,
  p_familia text default null,
  p_marca uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_desde date := make_date(p_anio, 1, 1);
  v_hasta date := make_date(p_anio, 12, 31);
  v_prev_desde date := make_date(p_anio - 1, 1, 1);
  v_prev_hasta date := make_date(p_anio - 1, 12, 31);
  v_res jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen');

  with base as (
    select f.cliente_id,
           f.fecha,
           case
             when f.tipo_documento = 'abono' then -abs(coalesce(f.base_imponible, f.total, 0))
             else abs(coalesce(f.base_imponible, f.total, 0))
           end as neta
    from public.facturas f
    where f.empresa_id = v_empresa
      and f.cliente_id is not null
      and f.tipo_documento in ('factura', 'abono', 'nota_cargo')
      and (v_puede_todo or public.es_mi_comercial(f.comercial_id))
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or public.factura_es_marca(f.id, p_marca))
        )
      )
  ),
  agg as (
    select cliente_id,
           min(fecha) as primera,
           max(fecha) as ultima,
           count(*) filter (where fecha between v_desde and v_hasta) as fac_anio,
           coalesce(sum(neta) filter (where fecha between v_desde and v_hasta), 0) as neta_anio,
           count(*) filter (where fecha between v_prev_desde and v_prev_hasta) as fac_prev,
           coalesce(sum(neta) filter (where fecha between v_prev_desde and v_prev_hasta), 0) as neta_prev,
           count(*) filter (where fecha >= current_date - 365) as fac_12m,
           coalesce(sum(neta) filter (where fecha >= current_date - 365), 0) as neta_12m
    from base
    group by cliente_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', a.cliente_id,
           'primera', a.primera,
           'ultima', a.ultima,
           'facturasAnio', a.fac_anio,
           'netaAnio', a.neta_anio,
           'facturasPrev', a.fac_prev,
           'netaPrev', a.neta_prev,
           'facturas12m', a.fac_12m,
           'neta12m', a.neta_12m
         )), '[]'::jsonb)
  into v_res
  from agg a;

  return v_res;
end;
$$;

revoke execute on function public.clientes_actividad(text, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.clientes_actividad(text, integer, uuid, uuid, text, uuid) to authenticated;

create or replace function public.clientes_margen(
  p_codigo_empresa text,
  p_anio integer,
  p_cliente uuid default null,
  p_comercial uuid default null,
  p_familia text default null,
  p_marca uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_desde date := make_date(p_anio, 1, 1);
  v_hasta date := make_date(p_anio, 12, 31);
  v_res jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    raise exception 'empresa no encontrada: %', p_codigo_empresa;
  end if;

  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen');

  with costes as (
    select l.articulo_id,
           sum(coalesce(l.coste_completo_unitario, 0) * coalesce(l.cantidad, 0)) as suma,
           sum(coalesce(l.cantidad, 0)) as qty
    from public.v_coste_completo_por_lote l
    where l.empresa_id = v_empresa
    group by l.articulo_id
  ),
  base as (
    select f.cliente_id,
           coalesce(fl.cantidad, 0) * coalesce(
             nullif(fl.coste_unitario, 0),
             case when c.qty > 0 then c.suma / c.qty end,
             a.coste_unitario,
             a.precio_coste,
             0
           ) as coste
    from public.facturas f
    join public.factura_lineas fl on fl.factura_id = f.id
    left join public.articulos a on a.id = fl.articulo_id
    left join costes c on c.articulo_id = fl.articulo_id
    where f.empresa_id = v_empresa
      and f.cliente_id is not null
      and f.fecha between v_desde and v_hasta
      and f.tipo_documento in ('factura', 'nota_cargo', 'abono')
      and (v_puede_todo or public.es_mi_comercial(f.comercial_id))
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (p_familia is null or a.familia = p_familia)
      and (p_marca is null or public.factura_es_marca(f.id, p_marca))
  ),
  agg as (
    select cliente_id, sum(coste) as coste
    from base
    group by cliente_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', a.cliente_id,
           'coste', a.coste
         )), '[]'::jsonb)
  into v_res
  from agg a;

  return v_res;
end;
$$;

revoke execute on function public.clientes_margen(text, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.clientes_margen(text, integer, uuid, uuid, text, uuid) to authenticated;


-- Rankings de Facturación: ahora los filtros se aplican a TODAS las secciones
-- (top de referencias, top de clientes y comerciales por facturación).
--
-- Antes, top_clientes y comerciales ignoraban los filtros por diseño. A petición
-- del cliente, si se filtra por cliente/comercial/familia/marca, los tres
-- rankings deben responder al mismo filtro.
--
-- Idempotente. Se aplica en Supabase SQL Editor.

create or replace function public.perf_rankings_facturacion(
  p_codigo_empresa text,
  p_anio integer,
  p_cliente uuid default null,
  p_comercial uuid default null,
  p_familia text default null,
  p_marca uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_prev integer := p_anio - 1;
  v_rol text := public.auth_role();
  v_com uuid := public.auth_comercial_id();
  v_puede_todo boolean;
  v_desde date := make_date(p_anio, 1, 1);
  v_hasta date := make_date(p_anio, 12, 31);
  v_desde_prev date := make_date(v_prev, 1, 1);
  v_hasta_prev date := make_date(v_prev, 12, 31);
  v_top_ref jsonb;
  v_top_cli jsonb;
  v_comerciales jsonb;
begin
  select id into v_empresa from public.empresas where codigo = p_codigo_empresa;
  if v_empresa is null then
    select id into v_empresa from public.empresas where codigo = 'SF';
  end if;
  v_puede_todo := v_rol in ('admin', 'direccion', 'financiero', 'lectura');

  -- TOP 10 referencias (respeta filtros), por unidades.
  with lin as (
    select fl.articulo_id, fl.cantidad, fl.base_imponible
    from public.factura_lineas fl
    join public.facturas f on f.id = fl.factura_id
    left join public.articulos a on a.id = fl.articulo_id
    where f.empresa_id = v_empresa
      and f.fecha >= v_desde and f.fecha <= v_hasta
      and (v_puede_todo or public.es_mi_comercial(f.comercial_id))
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (p_familia is null or a.familia = p_familia)
      and (p_marca is null or public.factura_es_marca(f.id, p_marca))
      and fl.articulo_id is not null
  ),
  ref as (
    select articulo_id, sum(cantidad) as unidades, sum(coalesce(base_imponible, 0)) as neta
    from lin
    group by articulo_id
    order by sum(cantidad) desc nulls last
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'articulo', coalesce(ar.nombre, '—'),
           'codigo', ar.codigo_erp,
           'unidades', ref.unidades,
           'neta', ref.neta
         ) order by ref.unidades desc nulls last), '[]'::jsonb)
  into v_top_ref
  from ref
  left join public.articulos ar on ar.id = ref.articulo_id;

  -- TOP 20 clientes (ahora también con filtros).
  with fcur as (
    select f.id, f.cliente_id, f.base_imponible
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde and f.fecha <= v_hasta
      and (v_puede_todo or public.es_mi_comercial(f.comercial_id)) and f.cliente_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or public.factura_es_marca(f.id, p_marca))
        )
      )
  ),
  ncur as (select cliente_id, sum(base_imponible) as neta from fcur group by cliente_id),
  ucur as (
    select fc.cliente_id, coalesce(sum(fl.cantidad), 0) as unidades
    from fcur fc join public.factura_lineas fl on fl.factura_id = fc.id
    group by fc.cliente_id
  ),
  nprev as (
    select f.cliente_id, sum(f.base_imponible) as neta_prev
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde_prev and f.fecha <= v_hasta_prev
      and (v_puede_todo or public.es_mi_comercial(f.comercial_id)) and f.cliente_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or public.factura_es_marca(f.id, p_marca))
        )
      )
    group by f.cliente_id
  ),
  top as (
    select ncur.cliente_id, ncur.neta,
           coalesce(ucur.unidades, 0) as unidades,
           coalesce(nprev.neta_prev, 0) as neta_prev
    from ncur
    left join ucur on ucur.cliente_id = ncur.cliente_id
    left join nprev on nprev.cliente_id = ncur.cliente_id
    order by ncur.neta desc nulls last
    limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente', coalesce(c.nombre, '—'),
           'neta', top.neta,
           'unidades', top.unidades,
           'comercial', coalesce(co.nombre, '—'),
           'neta_prev', top.neta_prev
         ) order by top.neta desc nulls last), '[]'::jsonb)
  into v_top_cli
  from top
  left join public.clientes c on c.id = top.cliente_id
  left join public.comerciales co on co.id = c.comercial_id;

  -- Comerciales por facturación (ahora también con filtros).
  with fcur as (
    select f.id, f.comercial_id, f.base_imponible
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde and f.fecha <= v_hasta
      and (v_puede_todo or public.es_mi_comercial(f.comercial_id)) and f.comercial_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or public.factura_es_marca(f.id, p_marca))
        )
      )
  ),
  icur as (select comercial_id, sum(base_imponible) as importe from fcur group by comercial_id),
  ucur as (
    select fc.comercial_id, coalesce(sum(fl.cantidad), 0) as unidades
    from fcur fc join public.factura_lineas fl on fl.factura_id = fc.id
    group by fc.comercial_id
  ),
  iprev as (
    select f.comercial_id, sum(f.base_imponible) as importe_prev
    from public.facturas f
    where f.empresa_id = v_empresa and f.fecha >= v_desde_prev and f.fecha <= v_hasta_prev
      and (v_puede_todo or public.es_mi_comercial(f.comercial_id)) and f.comercial_id is not null
      and (p_cliente is null or f.cliente_id = p_cliente)
      and (p_comercial is null or f.comercial_id = p_comercial)
      and (
        (p_familia is null and p_marca is null)
        or exists (
          select 1 from public.factura_lineas fl
          join public.articulos a on a.id = fl.articulo_id
          where fl.factura_id = f.id
            and (p_familia is null or a.familia = p_familia)
            and (p_marca is null or public.factura_es_marca(f.id, p_marca))
        )
      )
    group by f.comercial_id
  ),
  coms as (
    select icur.comercial_id, icur.importe,
           coalesce(ucur.unidades, 0) as unidades,
           coalesce(iprev.importe_prev, 0) as importe_prev
    from icur
    left join ucur on ucur.comercial_id = icur.comercial_id
    left join iprev on iprev.comercial_id = icur.comercial_id
    order by icur.importe desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'comercial', coalesce(co.nombre, '—'),
           'anio', p_anio,
           'importe', coms.importe,
           'unidades', coms.unidades,
           'importe_prev', coms.importe_prev
         ) order by coms.importe desc nulls last), '[]'::jsonb)
  into v_comerciales
  from coms
  left join public.comerciales co on co.id = coms.comercial_id;

  return jsonb_build_object(
    'top_referencias', v_top_ref,
    'top_clientes', v_top_cli,
    'comerciales', v_comerciales
  );
end;
$$;

comment on function public.perf_rankings_facturacion(text, integer, uuid, uuid, text, uuid) is
  'Rankings de la pestaña Facturación: TOP 10 referencias, TOP 20 clientes y comerciales, todos '
  'respetando los filtros activos y la cartera del rol.';

revoke execute on function public.perf_rankings_facturacion(text, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.perf_rankings_facturacion(text, integer, uuid, uuid, text, uuid) to authenticated;


create or replace function public.cobros_resumen(p_codigo_empresa text, p_cliente uuid default null)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with e as (
    select id from public.empresas where codigo = p_codigo_empresa
  ),
  base as (
    select c.cliente_id,
           c.pendiente,
           case when c.fecha_vencimiento is null then 0 else (current_date - c.fecha_vencimiento) end as dias
    from public.cobros_cartera c, e
    where c.empresa_id = e.id
      and c.pendiente <> 0
      and (p_cliente is null or c.cliente_id = p_cliente)
      and (
        public.auth_role() in ('admin', 'direccion', 'financiero', 'lectura', 'administracion')
        or c.cliente_id in (
          select cl.id from public.clientes cl
          where public.es_mi_comercial(cl.comercial_id)
        )
      )
  ),
  agg as (
    select coalesce(sum(pendiente), 0) as saldo,
           coalesce(sum(pendiente) filter (where dias > 0), 0) as vencido,
           coalesce(sum(pendiente) filter (where dias > 90), 0) as vencido90,
           coalesce(sum(pendiente) filter (where dias <= 0), 0) as futuro,
           coalesce(sum(pendiente) filter (where dias <= 0), 0) as corriente,
           coalesce(sum(pendiente) filter (where dias between 1 and 30), 0) as d1_30,
           coalesce(sum(pendiente) filter (where dias between 31 and 60), 0) as d31_60,
           coalesce(sum(pendiente) filter (where dias between 61 and 90), 0) as d61_90,
           coalesce(sum(pendiente) filter (where dias > 90), 0) as d90
    from base
  ),
  porc as (
    select cliente_id,
           sum(pendiente) as saldo,
           coalesce(sum(pendiente) filter (where dias > 0), 0) as vencido
    from base
    where cliente_id is not null
    group by cliente_id
  )
  select jsonb_build_object(
    'saldo', (select saldo from agg),
    'vencido', (select vencido from agg),
    'vencido90', (select vencido90 from agg),
    'futuro', (select futuro from agg),
    'buckets', jsonb_build_object(
      'corriente', (select corriente from agg),
      'd1_30', (select d1_30 from agg),
      'd31_60', (select d31_60 from agg),
      'd61_90', (select d61_90 from agg),
      'd90', (select d90 from agg)
    ),
    'por_cliente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente_id', cliente_id, 'saldo', saldo, 'vencido', vencido
      ))
      from porc
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.cobros_resumen(text, uuid) from public, anon;
grant execute on function public.cobros_resumen(text, uuid) to authenticated;
