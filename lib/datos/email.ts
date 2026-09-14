const RESEND_URL = 'https://api.resend.com/emails';

export type EmailDatos = {
  to: string | string[];
  asunto: string;
  html: string;
  texto: string;
};

/**
 * Envío de correo vía Resend (fetch directo, sin SDK). Si no hay
 * RESEND_API_KEY configurada, vuelca el correo en un log de advertencia
 * y devuelve { enviado: false, razon: 'sin-llave' } sin fallar.
 *
 * En Vercel: variables RESEND_API_KEY y ALERTAS_EMAIL_TO (destinatarios,
 * separados por coma).
 */
export async function enviarEmail(datos: EmailDatos) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] Sin RESEND_API_KEY. Correo no enviado: ${datos.asunto}`);
    return { enviado: false as const, razon: 'sin-llave', respuesta: null };
  }

  const destinatarios = (Array.isArray(datos.to) ? datos.to : [datos.to])
    .map((t) => t.trim())
    .filter(Boolean);

  if (destinatarios.length === 0) {
    console.warn(`[email] Sin destinatarios para: ${datos.asunto}`);
    return { enviado: false as const, razon: 'sin-destinatarios', respuesta: null };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? 'sfbathroom BI <alertas@sfbathroom.es>',
        to: destinatarios,
        subject: datos.asunto,
        html: datos.html,
        text: datos.texto,
      }),
    });
    const respuesta = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error('[email] Resend rechazó el correo', res.status, respuesta);
      return { enviado: false as const, razon: 'rechazado', respuesta };
    }
    return { enviado: true as const, razon: 'ok', respuesta };
  } catch (error) {
    console.error('[email] Error de red enviando correo', error);
    return { enviado: false as const, razon: 'error-red', respuesta: String(error) };
  }
}