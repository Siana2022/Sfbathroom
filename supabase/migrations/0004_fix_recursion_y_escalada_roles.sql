-- ============================================================
-- SFBATHROOM BI · Fix RLS: recursión en auth_role y escalada de rol
-- Dos problemas detectados en producción:
-- 1) auth_role()/auth_comercial_id() como security invoker provocan
--    recursión infinita: cualquier SELECT con RLS llama a auth_role(),
--    que lee profiles, cuya política vuelve a llamar a auth_role()
--    (error "stack depth limit exceeded"). Deben ejecutarse como
--    security definer para leer el propio perfil durante la evaluación
--    de políticas, con search_path fijado.
-- 2) profiles_self_update permitía a cualquier usuario ponerse
--    role = 'admin' a sí mismo (escalada). Se limita el cambio de rol
--    a admin.
-- 2026-09-07.
-- ============================================================

-- ---------- 1. auth_role() / auth_comercial_id(): security definer ----------
create or replace function public.auth_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_comercial_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select comercial_id from public.profiles where id = auth.uid();
$$;

-- Solo los usuarios autenticados pueden usarlas (las políticas de RLS las
-- invocan como el usuario que consulta). anon/public no deben ejecutarlas.
revoke execute on function public.auth_role() from public, anon;
revoke execute on function public.auth_comercial_id() from public, anon;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.auth_comercial_id() to authenticated;

-- ---------- 2. Escalada de rol: quitar el auto-update de role ----------
drop policy if exists profiles_self_update on public.profiles;

-- El propio usuario puede editar sus datos, pero NO cambiar su rol:
-- la fila nueva debe mantener su rol actual (auth_role()).
create policy profiles_self_update_datos on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.auth_role());

-- Solo admin puede cambiar roles (de cualquier fila, incluida la suya).
create policy profiles_admin_update on public.profiles
  for update using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');