-- ============================================================
-- 0044 · Un comercial puede llevar VARIAS carteras
--
-- Problema real: Carlos Tarazona no es un comercial en A3ERP, son DIEZ. Tiene un
-- codigo distinto en cada empresa (SF 5/6/18/10, DOT 4/8/10, FUX 5/6/17/18) y
-- cada uno lleva su trozo de cartera. `profiles.comercial_id` es UN solo uuid,
-- asi que no habia forma de darle sus diez carteras.
--
-- Solucion: `perfiles_comerciales`, una fila por (usuario, cartera). `profiles.
-- comercial_id` se mantiene como cartera principal y sigue valiendo: la funcion
-- devuelve la union de las dos cosas, asi que los comerciales ya existentes
-- (Lucia, Marco) no se tocan.
--
-- Alcance: solo cambia lo que ve el rol `comercial`. admin, direccion,
-- financiero, lectura, administracion y almacen conservan exactamente sus
-- permisos de antes: las politicas siguen empezando por
-- `auth_role() in (...)` y solo se reescribe la rama del comercial.
--
-- Las 19 politicas de abajo estan REGENERADAS a partir de su ultima definicion
-- real, no reescritas a mano. Para comprobar que han entrado las 19 hay que
-- mirar LAS DOS columnas: en pg_policies, una politica `for insert` guarda su
-- expresion en `with_check` y deja `qual` a NULL. Contando solo `qual` salen 15
-- (las 4 de insert -contactos, interacciones, reuniones, hitos- no aparecen):
--   select count(*) from pg_policies where schemaname='public'
--     and (coalesce(qual,'') like '%auth_comercial_ids%'
--          or coalesce(with_check,'') like '%auth_comercial_ids%');   -- 19
--
-- Y lo que de verdad importa, restos que se quedaron con una sola cartera
-- (debe salir vacio; el patron no coincide con auth_comercial_ids() porque
-- entre el id y el parentesis va una s):
--   select tablename, policyname from pg_policies where schemaname='public'
--     and (coalesce(qual,'') like '%auth_comercial_id()%'
--          or coalesce(with_check,'') like '%auth_comercial_id()%');
--
-- Idempotente.
-- ============================================================

-- ---------- 1. Carteras por usuario ----------
create table if not exists public.perfiles_comerciales (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  comercial_id uuid not null references public.comerciales(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, comercial_id)
);

comment on table public.perfiles_comerciales is
  'Carteras asignadas a un usuario. Permite que un comercial lleve varias (una por empresa o zona).';

alter table public.perfiles_comerciales enable row level security;

-- Cada usuario ve las suyas; admin y direccion, todas. Escritura solo admin.
drop policy if exists perfiles_comerciales_select on public.perfiles_comerciales;
create policy perfiles_comerciales_select on public.perfiles_comerciales for select using (
  profile_id = auth.uid() or public.auth_role() in ('admin','direccion')
);

drop policy if exists perfiles_comerciales_admin on public.perfiles_comerciales;
create policy perfiles_comerciales_admin on public.perfiles_comerciales for all
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create index if not exists idx_perfiles_comerciales_comercial
  on public.perfiles_comerciales(comercial_id);

-- ---------- 2. Las carteras del usuario, como conjunto ----------
-- security definer: la invocan las politicas de RLS, y leer profiles o
-- perfiles_comerciales desde dentro de una politica provocaria recursion.
create or replace function public.auth_comercial_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  -- Las asignadas en la tabla nueva...
  select pc.comercial_id from public.perfiles_comerciales pc where pc.profile_id = auth.uid()
  union
  -- ...mas la principal de siempre, para no romper a los comerciales actuales.
  select p.comercial_id from public.profiles p
   where p.id = auth.uid() and p.comercial_id is not null;
$$;

revoke all on function public.auth_comercial_ids() from public, anon;
grant execute on function public.auth_comercial_ids() to authenticated;

-- ---------- 3. Las 19 politicas que miraban una sola cartera ----------
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id in (select public.auth_comercial_ids()))
);

drop policy if exists facturas_select on public.facturas;
create policy facturas_select on public.facturas for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id in (select public.auth_comercial_ids()))
);

drop policy if exists factura_lineas_select on public.factura_lineas;
create policy factura_lineas_select on public.factura_lineas for select using (
  exists (
    select 1 from public.facturas f
    where f.id = factura_lineas.factura_id
      and (
        public.auth_role() in ('admin','direccion','financiero','lectura')
        or (public.auth_role() = 'comercial' and f.comercial_id in (select public.auth_comercial_ids()))
      )
  )
);

drop policy if exists pedidos_select on public.pedidos;
create policy pedidos_select on public.pedidos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
);

drop policy if exists pedido_lineas_select on public.pedido_lineas;
create policy pedido_lineas_select on public.pedido_lineas for select using (
  exists (
    select 1 from public.pedidos p
    where p.id = pedido_lineas.pedido_id
      and (
        public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
        or (public.auth_role() = 'comercial' and p.comercial_id in (select public.auth_comercial_ids()))
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
      where cl.id = incidencias.cliente_id
        and cl.comercial_id in (select public.auth_comercial_ids())
    )
  )
);

drop policy if exists presupuesto_select on public.presupuesto;
create policy presupuesto_select on public.presupuesto for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura')
  or (public.auth_role() = 'comercial' and comercial_id in (select public.auth_comercial_ids()))
);

drop policy if exists contactos_select on public.contactos;
create policy contactos_select on public.contactos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
);

drop policy if exists contactos_insert on public.contactos;
create policy contactos_insert on public.contactos for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
);

drop policy if exists contactos_update on public.contactos;
create policy contactos_update on public.contactos for update using (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
) with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
  )
);

drop policy if exists interacciones_select on public.interacciones;
create policy interacciones_select on public.interacciones for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
);

drop policy if exists interacciones_insert on public.interacciones;
create policy interacciones_insert on public.interacciones for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
  )
);

drop policy if exists interacciones_update on public.interacciones;
create policy interacciones_update on public.interacciones for update using (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
) with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
  )
);

drop policy if exists reuniones_select on public.reuniones;
create policy reuniones_select on public.reuniones for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
);

drop policy if exists reuniones_insert on public.reuniones;
create policy reuniones_insert on public.reuniones for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
  )
);

drop policy if exists reuniones_update on public.reuniones;
create policy reuniones_update on public.reuniones for update using (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
) with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
  )
);

drop policy if exists hitos_select on public.hitos;
create policy hitos_select on public.hitos for select using (
  public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
);

drop policy if exists hitos_insert on public.hitos;
create policy hitos_insert on public.hitos for insert with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
  )
);

drop policy if exists hitos_update on public.hitos;
create policy hitos_update on public.hitos for update using (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (
      comercial_id in (select public.auth_comercial_ids())
      or cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
    )
  )
) with check (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and cliente_id in (select c.id from public.clientes c where c.comercial_id in (select public.auth_comercial_ids()))
  )
);

-- ---------- 4. Y las funciones de escritura del CRM ----------
-- `crm_autorizar_cliente` (0042) comprobaba UNA sola cartera, asi que con diez
-- carteras habria dado 403 en nueve de ellas. Se recrea con el conjunto.
-- Se define aqui entera (no se altera la de 0042) para que 0044 no dependa de
-- que 0042 este aplicada.
create or replace function public.crm_autorizar_cliente(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select role into v_rol from public.profiles where id = auth.uid();

  if v_rol in ('admin', 'direccion') then
    return;
  end if;

  if v_rol = 'comercial' and exists (
    select 1 from public.clientes c
    where c.id = p_cliente_id
      and c.comercial_id in (select public.auth_comercial_ids())
  ) then
    return;
  end if;

  raise exception 'Sin permiso sobre este cliente.' using errcode = '42501';
end;
$$;

revoke all on function public.crm_autorizar_cliente(uuid) from public, anon, authenticated;
