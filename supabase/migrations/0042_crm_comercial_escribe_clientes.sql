-- ============================================================
-- Módulo "Acceso comercial" · Fase 3 · El comercial mantiene el CRM de su cartera
--
-- Hasta ahora `clientes` solo lo podían escribir `admin` y `direccion`, pero el
-- comercial SÍ tiene que poder marcar el estado CRM y la persona habitual de los
-- clientes de su cartera: son datos suyos, de seguimiento, no de facturación.
--
-- El problema: RLS es por FILA, no por columna. Una política que dejase al
-- comercial actualizar su fila le dejaría también `limite_credito`,
-- `plazo_pactado_dias` y el resto de campos comerciales del cliente. Con una
-- política no se puede decir "esta fila sí, pero solo estas columnas".
--
-- Solución: la tabla NO se abre. Se abren dos funciones, una por campo, que
-- llevan la autorización dentro. La única puerta para el comercial son esas
-- funciones, y solo tocan las columnas que les corresponden.
--
-- Son SECURITY DEFINER porque necesitan saltarse el RLS para escribir (si no,
-- no servirían de nada). Por eso la comprobación de permisos va DENTRO, con
-- `auth.uid()`: sigue siendo el usuario de la petición aunque la función corra
-- como su propietario. `set search_path` fija el esquema y evita sorpresas.
--
-- Aditivo e idempotente. Se aplica en Supabase SQL Editor.
-- ============================================================

-- ---------- Autorización, compartida por las dos funciones ----------
-- Un comercial solo entra en los clientes de su cartera; dirección y admin, en
-- todos. Cualquier otro rol (lectura, financiero, almacén...) queda fuera, que
-- es como están ya `contactos`, `hitos` y `reuniones`.
create or replace function public.crm_autorizar_cliente(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_comercial uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select role, comercial_id into v_rol, v_comercial
  from public.profiles
  where id = auth.uid();

  if v_rol in ('admin', 'direccion') then
    return;
  end if;

  if v_rol = 'comercial' and exists (
    select 1 from public.clientes c
    where c.id = p_cliente_id
      and c.comercial_id = v_comercial
  ) then
    return;
  end if;

  raise exception 'Sin permiso sobre este cliente.' using errcode = '42501';
end;
$$;

-- ---------- 1. Estado CRM del cliente ----------
create or replace function public.crm_set_estado_cliente(
  p_cliente_id uuid,
  p_estado text,
  p_motivo text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_json json;
begin
  perform public.crm_autorizar_cliente(p_cliente_id);

  if p_estado is not null and p_estado not in ('habitual','nuevo','seguimiento','ganado','perdido') then
    raise exception 'Estado no válido: %', p_estado using errcode = '22023';
  end if;

  update public.clientes
  set estado_crm = p_estado,
      -- El motivo solo tiene sentido si el cliente queda como perdido: en
      -- cualquier otro caso se limpia, para no arrastrar un motivo viejo.
      motivo_perdida = case
        when p_estado = 'perdido' and p_motivo is not null and btrim(p_motivo) <> ''
          then btrim(p_motivo)
        else null
      end
  where id = p_cliente_id
  returning json_build_object(
    'id', id,
    'estado_crm', estado_crm,
    'motivo_perdida', motivo_perdida
  ) into v_json;

  if v_json is null then
    raise exception 'Cliente no encontrado.' using errcode = '22023';
  end if;

  return v_json;
end;
$$;

-- ---------- 2. Persona habitual de contacto ----------
-- `p_contacto_id` a null quita la persona habitual: la llamada solo se hace
-- cuando el cuerpo de la petición trae el campo, así que "null" aquí significa
-- "quitar", no "no tocar".
create or replace function public.crm_set_contacto_habitual(
  p_cliente_id uuid,
  p_contacto_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_json json;
begin
  perform public.crm_autorizar_cliente(p_cliente_id);

  if p_contacto_id is not null and not exists (
    select 1 from public.contactos
    where id = p_contacto_id and cliente_id = p_cliente_id
  ) then
    raise exception 'El contacto no pertenece a este cliente.' using errcode = '22023';
  end if;

  update public.clientes
  set contacto_habitual_id = p_contacto_id
  where id = p_cliente_id
  returning json_build_object(
    'id', id,
    'contacto_habitual_id', contacto_habitual_id
  ) into v_json;

  if v_json is null then
    raise exception 'Cliente no encontrado.' using errcode = '22023';
  end if;

  return v_json;
end;
$$;

-- ---------- Permisos ----------
-- Solo se exponen las dos funciones de escritura, y solo a `authenticated`.
--
-- OJO: en Supabase hay que revocar de `anon` EXPLÍCITAMENTE. Supabase concede
-- execute a anon/authenticated por defecto en el esquema public, y un
-- `revoke ... from public` NO quita esa concesión explícita: la función queda
-- ejecutable sin sesión. Comprobado contra el proyecto real (0043).
revoke all on function public.crm_autorizar_cliente(uuid) from public, anon, authenticated;
revoke all on function public.crm_set_estado_cliente(uuid, text, text) from public, anon;
revoke all on function public.crm_set_contacto_habitual(uuid, uuid) from public, anon;

grant execute on function public.crm_set_estado_cliente(uuid, text, text) to authenticated;
grant execute on function public.crm_set_contacto_habitual(uuid, uuid) to authenticated;
