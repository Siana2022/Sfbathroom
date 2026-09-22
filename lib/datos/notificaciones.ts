import { createServiceClient } from '@/lib/supabase/serviceRole';
import { createClient } from '@/lib/supabase/server';
import { enviarEmail, type EmailDatos } from '@/lib/datos/email';

type Canal = 'email' | 'inapp';

type NotifPayload = {
  usuarioId?: string;       // requerido para inapp
  empresaId?: string;      // uuid de empresa
  empresaCodigo?: string;  // alternativa: código (se resuelve)
  tipo: 'alerta' | 'resumen' | 'informe' | 'sistema';
  titulo: string;
  mensaje?: string;
  enlace?: string;
  canales?: Canal[];
};

/**
 * Envía notificación multicanal desde procesos server-side (jobs).
 * Inapp: inserta en tabla notificaciones con service_role.
 * Email: llama a enviarEmail (Resend).
 * Nunca falla: captura errores y devuelve { resultados }.
 */
export async function enviarNotificacion(payload: NotifPayload): Promise<{ inapp?: boolean; email?: boolean }> {
  const canales = payload.canales ?? ['inapp'];
  const resultados: { inapp?: boolean; email?: boolean } = {};

  let empresaUuid: string | undefined = payload.empresaId;
  if (!empresaUuid && payload.empresaCodigo) {
    try {
      const supabase = createServiceClient();
      const { data } = await supabase.from('empresas').select('id').eq('codigo', payload.empresaCodigo).maybeSingle();
      empresaUuid = (data as { id?: string } | null)?.id;
    } catch { /* sin empresa */ }
  }

  if (canales.includes('inapp') && payload.usuarioId) {
    try {
      const supabase = createServiceClient();
      const { error } = await supabase.from('notificaciones').insert({
        usuario_id: payload.usuarioId,
        empresa_id: empresaUuid ?? null,
        tipo: payload.tipo,
        titulo: payload.titulo,
        mensaje: payload.mensaje ?? null,
        enlace: payload.enlace ?? null,
      });
      resultados.inapp = !error;
      if (error) console.warn('[notificaciones] Error insert inapp:', error.message);
    } catch (err) {
      console.warn('[notificaciones] Error inapp:', err);
      resultados.inapp = false;
    }
  }

  if (canales.includes('email')) {
    const emailTo = process.env.ALERTAS_EMAIL_TO;
    if (emailTo) {
      const datos: EmailDatos = {
        to: emailTo.split(',').map((e) => e.trim()),
        asunto: `[SF BI] ${payload.titulo}`,
        html: `<p>${payload.titulo}</p><p>${payload.mensaje ?? ''}</p>`,
        texto: `${payload.titulo}\n\n${payload.mensaje ?? ''}`,
      };
      const r = await enviarEmail(datos);
      resultados.email = r.enviado;
    } else {
      resultados.email = false;
    }
  }

  return resultados;
}

/**
 * Marca notificaciones del usuario como leídas.
 * Usa el cliente de sesión: la RLS garantiza que solo el usuario dueño de la
 * notificación puede modificarla (no service_role).
 */
export async function marcarLeidas(usuarioId: string, ids?: string[]) {
  const supabase = createClient();
  let q = supabase.from('notificaciones').update({ leida: true }).eq('usuario_id', usuarioId).eq('leida', false);
  if (ids?.length) q = q.in('id', ids);
  await q;
}

/**
 * Cuenta notificaciones no leídas de un usuario.
 * Cliente de sesión con RLS (mismo razonamiento que marcarLeidas).
 */
export async function contarNoLeidas(usuarioId: string): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('leida', false);
  return count ?? 0;
}