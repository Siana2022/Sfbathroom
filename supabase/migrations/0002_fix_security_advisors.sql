-- Vista: forzar que respete la RLS del usuario que consulta, no la del creador
alter view public.v_margen_por_articulo set (security_invoker = true);

-- Funciones auxiliares de rol: no necesitan bypass de RLS (el propio perfil es legible por su dueño),
-- así que las pasamos a security invoker y fijamos search_path.
create or replace function public.auth_role()
returns text
language sql
security invoker
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_comercial_id()
returns uuid
language sql
security invoker
stable
set search_path = public
as $$
  select comercial_id from public.profiles where id = auth.uid();
$$;

-- handle_new_user sí necesita bypass de RLS (inserta el perfil nuevo), pero solo debe
-- ejecutarse desde el trigger, nunca invocarse directamente vía API.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
