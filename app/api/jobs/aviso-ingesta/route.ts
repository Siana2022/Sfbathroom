import { NextResponse, type NextRequest } from 'next/server';
import { enviarEmail } from '@/lib/datos/email';

export const maxDuration = 60;

const JOBS_SECRET = process.env.JOBS_CRON_SECRET;

/**
 * Aviso de la ingesta A3ERP que corre en el PC del cliente.
 * Lo invoca `ingesta/a3erp/src/notificar.mjs` (desde el .bat) SOLO cuando
 * la carga falla, para que un fallo nocturno no se quede en silencio.
 *
 * Vive bajo /api/jobs/* a propósito: así el middleware ya lo deja pasar sin
 * sesión de usuario siempre que lleve el JOBS_CRON_SECRET (cabecera
 * `Authorization: Bearer <secret>` o query `?secret=`).
 */
function autorizado(req: NextRequest): boolean {
  if (!JOBS_SECRET) return false;
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${JOBS_SECRET}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === JOBS_SECRET;
}

type Cuerpo = {
  empresa?: string;
  modo?: string;
  ok?: boolean | string;
  detalle?: string;
  origen?: string;
};

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Cuerpo;
  const empresas = String(body.empresa ?? '—').trim() || '—';
  const modo = String(body.modo ?? '—').trim() || '—';
  const ok = body.ok === true || body.ok === 'true';
  const detalle = String(body.detalle ?? '').trim();
  const origen = String(body.origen ?? 'PC ingesta').trim() || 'PC ingesta';
  const cuando = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

  const titulo = ok ? 'Ingesta A3ERP completada' : '⚠️ Ingesta A3ERP FALLIDA';
  const color = ok ? '#1a7f37' : '#cf222e';

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#1f2328;max-width:640px">
      <h2 style="margin-bottom:4px;color:${color}">${titulo}</h2>
      <p style="color:#65768a;margin-top:0">${cuando} · origen: ${origen}</p>
      <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
        <tbody>
          <tr><td><b>Empresa(s)</b></td><td>${empresas}</td></tr>
          <tr><td><b>Modo</b></td><td>${modo}</td></tr>
          <tr><td><b>Resultado</b></td><td>${ok ? 'OK' : 'Fallo'}</td></tr>
        </tbody>
      </table>
      ${detalle ? `<p style="margin-top:16px"><b>Detalle</b><br>${detalle.replace(/\n/g, '<br>')}</p>` : ''}
      <p style="color:#65768a;font-size:12px;margin-top:24px">
        Aviso automático de la ingesta nocturna (A3ERP → Supabase → cuadro de mando).
        Revisa los logs en el PC: <code>ingesta\\logs\\</code>.
      </p>
    </div>`;

  const texto = [
    titulo,
    `${cuando} · origen: ${origen}`,
    `Empresa(s): ${empresas}`,
    `Modo: ${modo}`,
    `Resultado: ${ok ? 'OK' : 'Fallo'}`,
    ...(detalle ? ['', 'Detalle:', detalle] : []),
  ].join('\n');

  const result = await enviarEmail({
    to: process.env.ALERTAS_EMAIL_TO ?? 'pon-aqui-tu-email@dominio.com',
    asunto: `${titulo} · ${empresas} (${modo})`,
    html,
    texto,
  });

  return NextResponse.json({ enviado: result.enviado, razon: result.razon, respuesta: result.respuesta });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
