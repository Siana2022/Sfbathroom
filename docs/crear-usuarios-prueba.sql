-- ============================================================
-- Usuarios de DEMOSTRACIÓN para comprobar qué ve cada rol.
-- Ejecutar en Supabase → SQL Editor (corre como postgres, salta RLS).
-- Usos: un usuario por rol con la misma contraseña, más dos comerciales
-- (para ver el aislamiento "solo ve lo suyo").
-- OJO: son datos de prueba — borrar al terminar las comprobaciones.
-- ============================================================

-- Contraseña compartida de prueba (cambiar y/o borrar usuarios después).
-- Si auth.admin_create_user no existe en tu versión, el bloque avisará y
-- habrá que crearlos en Dashboard → Authentication → Users (email+contraseña).

do $$
begin
  begin
    perform auth.admin_create_user(
      bypass_confirmation => true,
      email => 'admin@sfbathroom.demo',
      password => 'SfbDemo1234!',
      user_metadata => jsonb_build_object('full_name', 'Admin demo'),
      email_confirm => true
    );
  exception when others then
    raise notice 'admin_create_user no disponible o falló para admin: %', sqlerrm;
  end;

  begin
    perform auth.admin_create_user(
      bypass_confirmation => true,
      email => 'direccion@sfbathroom.demo',
      password => 'SfbDemo1234!',
      user_metadata => jsonb_build_object('full_name', 'Dirección demo'),
      email_confirm => true
    );
  exception when others then
    raise notice 'falló direccion: %', sqlerrm;
  end;

  begin
    perform auth.admin_create_user(
      bypass_confirmation => true,
      email => 'financiero@sfbathroom.demo',
      password => 'SfbDemo1234!',
      user_metadata => jsonb_build_object('full_name', 'Financiero demo'),
      email_confirm => true
    );
  exception when others then
    raise notice 'falló financiero: %', sqlerrm;
  end;

  begin
    perform auth.admin_create_user(
      bypass_confirmation => true,
      email => 'comercial@sfbathroom.demo',
      password => 'SfbDemo1234!',
      user_metadata => jsonb_build_object('full_name', 'Comercial demo'),
      email_confirm => true
    );
  exception when others then
    raise notice 'falló comercial: %', sqlerrm;
  end;

  begin
    perform auth.admin_create_user(
      bypass_confirmation => true,
      email => 'comercial2@sfbathroom.demo',
      password => 'SfbDemo1234!',
      user_metadata => jsonb_build_object('full_name', 'Comercial 2 demo'),
      email_confirm => true
    );
  exception when others then
    raise notice 'falló comercial2: %', sqlerrm;
  end;

  begin
    perform auth.admin_create_user(
      bypass_confirmation => true,
      email => 'administracion@sfbathroom.demo',
      password => 'SfbDemo1234!',
      user_metadata => jsonb_build_object('full_name', 'Administración demo'),
      email_confirm => true
    );
  exception when others then
    raise notice 'falló administracion: %', sqlerrm;
  end;

  begin
    perform auth.admin_create_user(
      bypass_confirmation => true,
      email => 'almacen@sfbathroom.demo',
      password => 'SfbDemo1234!',
      user_metadata => jsonb_build_object('full_name', 'Almacén demo'),
      email_confirm => true
    );
  exception when others then
    raise notice 'falló almacen: %', sqlerrm;
  end;
end $$;

-- ---------- Comerciales de prueba (para asignar carteras) ----------
insert into public.comerciales (codigo_erp, nombre)
values ('DEMO-01', 'Comercial demo uno'), ('DEMO-02', 'Comercial demo dos')
on conflict (codigo_erp) do nothing;

-- ---------- Asignar roles y cartera a cada usuario ----------
update public.profiles p
set role = v.role, comercial_id = v.comercial_id
from (
  values
    ('admin@sfbathroom.demo',              'admin'::text,         null::uuid),
    ('direccion@sfbathroom.demo',          'direccion',           null),
    ('financiero@sfbathroom.demo',         'financiero',          null),
    ('administracion@sfbathroom.demo',     'administracion',      null),
    ('almacen@sfbathroom.demo',            'almacen',             null),
    ('comercial@sfbathroom.demo',          'comercial',           (select id from public.comerciales where codigo_erp = 'DEMO-01')),
    ('comercial2@sfbathroom.demo',         'comercial',           (select id from public.comerciales where codigo_erp = 'DEMO-02'))
) as v(email, role, comercial_id)
join auth.users u on u.email = v.email
where p.id = u.id;

-- Comprobar el resultado (debe mostrar 7 filas con sus roles).
select u.email, p.role, c.nombre as comercial
from public.profiles p
join auth.users u on u.id = p.id
left join public.comerciales c on c.id = p.comercial_id
order by u.email;