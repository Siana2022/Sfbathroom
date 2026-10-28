-- ============================================================
-- 0045 · Cerrar la escalada de cartera en `profiles`
--
-- EL AGUJERO
-- `profiles_self_update_datos` (0004) es:
--   using      (id = auth.uid())
--   with check (id = auth.uid() and role = public.auth_role())
-- Traducido: puedes editar tu fila, pero no cambiarte el `role`. Se cerró la
-- escalada de ROL y se dejó abierta la de CARTERA, porque el `with check`
-- vigila `role` y no mira `comercial_id`.
--
-- Y `comercial_id` es justo la columna que decide el aislamiento:
--   auth_comercial_ids() = comercial_id from profiles where id = auth.uid()
-- Así que cualquier usuario autenticado podía, desde la consola del navegador:
--   update profiles set comercial_id = '<uuid de otro comercial>' where id = <el suyo>
-- y con eso leer y escribir el CRM de la cartera de otro: clientes, facturas,
-- pedidos, contactos, reuniones, hitos, interacciones. La tabla `comerciales`
-- es legible por cualquier autenticado (catalogos_select), así que el uuid no
-- era ningún obstáculo.
--
-- POR QUÉ NO SE ARREGLA CON RLS
-- Una política solo ve la fila NUEVA (`with check`); no tiene acceso a la
-- anterior. "Deja pasar todo menos estos dos campos" obliga a comparar con el
-- valor viejo, y eso solo lo puede hacer un trigger BEFORE, que recibe `old` y
-- `new`. Por eso 0004 no lo pudo cerrar: intentó arreglarlo con una política, y
-- con una política no se puede.
--
-- ALCANCE
-- Solo `profiles`. No toca ninguna otra tabla ni política. Protege `role` y
-- `comercial_id` para TODOS los roles, y admin queda exento (ya tenía
-- `profiles_admin_update` para poder asignar).
--
-- Verificado antes de escribirlo: la app NUNCA escribe en `profiles`, solo lo
-- lee. Los cambios de rol y cartera se hacen a mano por SQL Editor, que corre
-- como postgres y no pasa por este trigger.
--
-- Idempotente.
-- ============================================================

create or replace function public.profiles_proteger_columnas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin usuario autenticado no hay ataque posible, y esto cubre de una vez el
  -- SQL Editor (que corre como postgres), los jobs con service_role y psql.
  -- Es imprescindible: `docs/asignar-carteras-comercial.sql` cambia
  -- `comercial_id` desde el SQL Editor, y sin esta salida el trigger se lo
  -- bloquearía a sí mismo.
  if auth.uid() is null then
    return new;
  end if;

  -- admin puede todo: ya lo permite profiles_admin_update, y es quien asigna
  -- roles y carteras.
  if public.auth_role() = 'admin' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Solo admin puede cambiar el rol de un perfil.' using errcode = '42501';
  end if;

  -- `is distinct from` y no `<>`: si el valor no cambia, se deja pasar. Así un
  -- cliente que reenvíe la fila entera (con el mismo comercial_id) no se rompe.
  if new.comercial_id is distinct from old.comercial_id then
    raise exception 'Solo admin puede cambiar la cartera de un perfil.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_proteger_columnas on public.profiles;
create trigger profiles_proteger_columnas
  before update on public.profiles
  for each row execute function public.profiles_proteger_columnas();

-- Nota: no se revoca el execute de la función. Un trigger no comprueba permisos
-- al dispararse, y un `revoke` mal puesto aquí bloquearía TODA actualización de
-- profiles. Además, al devolver `trigger`, PostgREST no la puede invocar por RPC.

-- ============================================================
-- COMPROBACIÓN
--
-- 1. El trigger existe (debe salir una fila):
--   select tgname from pg_trigger
--   where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- 2. El agujero está cerrado. Con la sesión de un COMERCIAL, desde la consola
--    del navegador (F12). Debe dar error 42501:
--   const { data: { user } } = await supabase.auth.getUser();
--   const { error } = await supabase.from('profiles')
--     .update({ comercial_id: '00000000-0000-0000-0000-000000000000' })
--     .eq('id', user.id);
--   console.log(error?.code, error?.message);
--
-- 3. NO SE HA ROTO NADA (esto es lo que hay que probar sí o sí). Desde el
--    SQL Editor, que corre como postgres y debe seguir pudiendo asignar:
--   update public.profiles set role = role, comercial_id = comercial_id
--     where id = (select id from auth.users where email = 'c.tarazona@sfbathroom.com');
--   -- Debe funcionar sin error.
--
-- 4. Y un cambio real por SQL Editor, sobre un usuario de prueba:
--   update public.profiles set comercial_id = null
--     where id = (select id from auth.users where email = 'comercial.b@sfbathroom.com');
--   -- Debe funcionar. Si esto falla, el trigger está bloqueando al SQL Editor
--   -- y hay que parar: se habría roto la asignación de carteras.
-- ============================================================
