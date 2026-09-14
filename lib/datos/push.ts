import type { SupabaseClient } from '@supabase/supabase-js';
import webPush from 'web-push';
import { createServiceClient } from '@/lib/supabase/serviceRole';

export type PushMensaje = {
  titulo: string;
  cuerpo?: string;
  enlace?: string;
};

/**
 * Envía push a todas las suscripciones guardadas (o las de un usuario).
 * Usa service_role (solo server). Sin VAPID configurado no hace nada y
 * devuelve { enviados: 0, pendientesVapid: true }.
 */
export async function enviarPush(mensaje: PushMensaje, usuarioId?: string) {
  const vapidPub = process.env.VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPub || !vapidPriv) {
    console.warn('[push] Sin VAPID. Push no enviado.');
    return { enviados: 0, pendientesVapid: true };
  }

  const supabase = createServiceClient();
  type SelectBuilder = ReturnType<ReturnType<SupabaseClient['from']>['select']>;
  let query: SelectBuilder = supabase
    .from('push_subscriptions')
    .select('endpoint, keys_p256dh, keys_auth');
  if (usuarioId) query = query.eq('usuario_id', usuarioId);
  const { data } = await query;

  webPush.setVapidDetails(
    process.env.RESEND_FROM ?? 'mailto:alertas@sfbathroom.es',
    vapidPub,
    vapidPriv,
  );

  const payload = JSON.stringify({ title: mensaje.titulo, body: mensaje.cuerpo ?? '', url: mensaje.enlace ?? '/' });
  let enviados = 0;
  const fallidas: string[] = [];

  for (const s of (data ?? []) as { endpoint: string; keys_p256dh: string; keys_auth: string }[]) {
    try {
      await webPush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.keys_p256dh, auth: s.keys_auth } },
        payload,
      );
      enviados += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) fallidas.push(s.endpoint);
    }
  }

  if (fallidas.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', fallidas);
  }
  return { enviados, pendientesVapid: false, fallidas: fallidas.length };
}