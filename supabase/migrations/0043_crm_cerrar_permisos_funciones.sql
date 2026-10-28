-- ============================================================
-- Cierre de permisos de las funciones de 0042
--
-- Al verificar 0042 contra el proyecto real, la comprobación por PostgREST dio
-- que `anon` (sin sesión) SÍ podía ejecutar las funciones: respondían 401 con
-- el mensaje "No autenticado", que es el raise de dentro de
-- `crm_autorizar_cliente`. Es decir, el cuerpo se ejecutaba. Una función que no
-- existiera habría dado 404 PGRST202, no 401.
--
-- Causa: Supabase concede execute a anon/authenticated por defecto en el
-- esquema public, y `revoke ... from public` NO quita una concesión explícita a
-- un rol concreto. Había que revocar de `anon` por su nombre.
--
-- No era una brecha explotable: la autorización es lo primero que corre y
-- levanta excepción antes de tocar nada, así que anon no podía escribir. Pero
-- dejar la puerta entornada en funciones que escriben es una mala base, y
-- cuesta una línea cerrarla.
--
-- 0042 queda corregido para instalaciones nuevas; esta migración arregla el
-- proyecto que ya lo tiene aplicado. Idempotente.
-- ============================================================

revoke all on function public.crm_autorizar_cliente(uuid) from public, anon, authenticated;
revoke all on function public.crm_set_estado_cliente(uuid, text, text) from public, anon;
revoke all on function public.crm_set_contacto_habitual(uuid, uuid) from public, anon;

grant execute on function public.crm_set_estado_cliente(uuid, text, text) to authenticated;
grant execute on function public.crm_set_contacto_habitual(uuid, uuid) to authenticated;
