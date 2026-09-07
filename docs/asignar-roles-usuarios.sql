-- ============================================================
-- Asignar rol y cartera a los usuarios ya creados en
-- Supabase → Authentication → Users (email + contraseña).
-- El trigger on_auth_user_created (0001) ya creó su fila en
-- profiles con rol por defecto 'lectura'; aquí se les pone
-- el rol funcional y, a los comerciales, su comercial_id.
-- Ejecutar en Supabase → SQL Editor.
-- ============================================================

-- ---------- 0. Ver quién hay: usiarios vs su perfil ----------
-- Cada usuario creado en Auth debe tener su fila en profiles.
-- Si alguno aparece con rol NULL o no aparece, avísanos.
select u.email, p.role, u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;

-- ---------- 1. Comerciales disponibles para asignar cartera ----------
select id, codigo_erp, nombre from public.comerciales order by nombre;

-- ---------- 2. Asignar roles (edita emails y roles) ----------
-- Roles válidos: admin, direccion, comercial, financiero,
-- lectura, administracion, almacen.
-- Para comerciales, indica el codigo_erp de su cartera; a los
-- demás dales null. Ajusta el EMAIL de cada fila al real.
update public.profiles p
set role = v.role,
    comercial_id = c.id
from (
  values
    ('PON-AQUI-EL-EMAIL-ADMIN',         'admin'::text,          null::text),
    ('PON-AQUI-EL-EMAIL-DIRECCION',    'direccion',            null),
    ('PON-AQUI-EL-EMAIL-FINANCIERO',   'financiero',           null),
    ('PON-AQUI-EL-EMAIL-ADMINISTRA',   'administracion',       null),
    ('PON-AQUI-EL-EMAIL-ALMACEN',      'almacen',              null),
    ('PON-AQUI-EL-EMAIL-COMERCIAL-1',  'comercial',            'DEMO-01'),
    ('PON-AQUI-EL-EMAIL-COMERCIAL-2',  'comercial',            'DEMO-02')
) as v(email, role, codigo_erp)
join auth.users u on u.email = v.email
left join public.comerciales c on c.codigo_erp = v.codigo_erp
where p.id = u.id;

-- ---------- 3. Comprobar el resultado ----------
select u.email, p.role, c.nombre as comercial
from public.profiles p
join auth.users u on u.id = p.id
left join public.comerciales c on c.id = p.comercial_id
order by u.email;