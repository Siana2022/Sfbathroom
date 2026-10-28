-- ============================================================
-- Asignar VARIAS carteras a un comercial (tras aplicar 0044).
--
-- En A3ERP una persona que vende en varias empresas aparece como un comercial
-- distinto en cada una, con su código y su trozo de cartera. `profiles.
-- comercial_id` solo admite una, así que las demás van en `perfiles_comerciales`.
--
-- Carlos Tarazona: 9 carteras, 1.922 clientes en total (SF 718, DOT 496, FUX 708).
-- Se dejan fuera a propósito PARTICULARES (SF 139 + FUX 142) y PROVEEDORES
-- (SF 25 + FUX 25), que están entre sus códigos pero no son cartera de ventas.
--
-- La lista de códigos está COPIADA A MANO de la consulta de abajo, y ahí está el
-- riesgo: si se escribe un código que no existe, no da error, simplemente no
-- asigna nada y pasa desapercibido. Al cambiar la lista, comprueba que la
-- consulta del paso 5 devuelve exactamente tantas filas como códigos hay aquí.
--
-- Ejecutar en Supabase → SQL Editor. Los datos salen de aquí:
--   select e.codigo, cm.codigo_erp, cm.nombre, count(c.id) as clientes
--   from public.comerciales cm
--   join public.empresas e on e.id = cm.empresa_id
--   left join public.clientes c on c.comercial_id = cm.id
--   group by e.codigo, cm.codigo_erp, cm.nombre order by clientes desc;
-- ============================================================

-- ---------- 1. El usuario existe y su perfil está creado ----------
select u.email, p.role, p.comercial_id
from auth.users u
left join public.profiles p on p.id = u.id
where u.email = 'c.tarazona@sfbathroom.com';

-- ---------- 2. Comerciales de Carlos Tarazona, uno por empresa ----------
-- Ojo: hay que elegir cuáles son cartera suya de verdad. En sus códigos hay
-- agrupaciones que NO son cartera de ventas (PARTICULARES, PROVEEDORES).
select e.codigo as empresa, cm.codigo_erp, cm.nombre,
       count(c.id) as clientes, cm.id as comercial_id
from public.comerciales cm
join public.empresas e on e.id = cm.empresa_id
left join public.clientes c on c.comercial_id = cm.id
where cm.nombre ilike '%TARAZONA%'
group by e.codigo, cm.codigo_erp, cm.nombre, cm.id
order by e.codigo, clientes desc;

-- ---------- 3. Rol + cartera principal ----------
-- La principal es la que da nombre al contexto; con una cartera grande en SF
-- tiene sentido que sea esa.
update public.profiles
set role = 'comercial',
    comercial_id = (
      select cm.id from public.comerciales cm
      join public.empresas e on e.id = cm.empresa_id
      where cm.codigo_erp = '5' and e.codigo = 'SF'
    )
where id = (select id from auth.users where email = 'c.tarazona@sfbathroom.com');

-- ---------- 4. Las demás carteras ----------
-- Repite por cada (empresa, codigo_erp) que sea cartera suya. El `select` busca
-- el usuario por email, así que no hay que copiar uuids a mano.
insert into public.perfiles_comerciales (profile_id, comercial_id)
select u.id, cm.id
from auth.users u
join public.comerciales cm on true
join public.empresas e on e.id = cm.empresa_id
where u.email = 'c.tarazona@sfbathroom.com'
  and (e.codigo, cm.codigo_erp) in (
    ('SF',  '5'),   -- España/Portugal · 635 clientes
    ('SF',  '6'),   -- Francia/Bélgica   ·  65
    ('SF',  '18'),  --                   ·  18
    ('DOT', '4'),   -- España            · 474
    ('DOT', '8'),   -- Francia           ·   9
    ('DOT', '10'),  --                   ·  13
    ('FUX', '5'),   -- España/Portugal   · 628
    ('FUX', '6'),   -- Francia/Bélgica   ·  62
    ('FUX', '17')   --                   ·  18
  )
on conflict (profile_id, comercial_id) do nothing;

-- ---------- 5. Comprobar ----------
select e.codigo as empresa, cm.codigo_erp, cm.nombre,
       (select count(*) from public.clientes c where c.comercial_id = cm.id) as clientes
from public.perfiles_comerciales pc
join public.comerciales cm on cm.id = pc.comercial_id
join public.empresas e on e.id = cm.empresa_id
where pc.profile_id = (select id from auth.users where email = 'c.tarazona@sfbathroom.com')
order by e.codigo, clientes desc;
