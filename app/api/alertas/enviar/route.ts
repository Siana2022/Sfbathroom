import { NextResponse } from 'next/server';
import { getAlertas } from '@/lib/datos/alertas';
import { enviarEmail } from '@/lib/datos/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Genera y envía un correo con el resumen de señales críticas/aviso.
 * Invocable por cron (Vercel Cron `GET /api/alertas/enviar?empresa=SF` o
 * un workflow n8n con `POST`). Protegido por ALERTAS_CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.ALERTAS_CRON_SECRET) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const codigo = url.searchParams.get('empresa') ?? 'SF';
  const anio = Number(url.searchParams.get('anio') ?? new Date().getFullYear());

  const d = await getAlertas(codigo, anio);
  const criticas = d.senales.filter((s) => s.severidad === 'critico');
  const avisos = d.senales.filter((s) => s.severidad === 'aviso');

  if (criticas.length === 0 && avisos.length === 0) {
    return NextResponse.json({ enviado: false, motivo: 'sin-señales', criticas: 0, avisos: 0 });
  }

  const filas = (s: { etiqueta: string; valor: string }[]) =>
    s.map((x) => `<tr><td>${x.etiqueta}</td><td>${x.valor}</td></tr>`).join('');

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#1f2328;max-width:640px">
      <h2 style="margin-bottom:4px">Alertas ${d.empresa.nombre} · ${anio}</h2>
      <p style="color:#65768a;margin-top:0">Resumen automático ${new Date().toLocaleDateString('es-ES')}</p>
      ${criticas.length ? `<h3>Críticas (${criticas.length})</h3><table border="1" cellpadding="8" style="border-collapse:collapse;width:100%"><tbody>${filas(criticas)}</tbody></table>` : ''}
      ${avisos.length ? `<h3>Avisos (${avisos.length})</h3><table border="1" cellpadding="8" style="border-collapse:collapse;width:100%"><tbody>${filas(avisos)}</tbody></table>` : ''}
      <p style="color:#65768a;font-size:12px;margin-top:24px">Cuadro de mando sfbathroom. Umbrales editables en Configuración.</p>
    </div>`;

  const texto = [
    `Alertas ${d.empresa.nombre} · ${anio}`,
    '',
    ...(criticas.length ? [`CRÍTICAS (${criticas.length}):`, ...criticas.map((c) => `- ${c.etiqueta}: ${c.valor}`), ''] : []),
    ...(avisos.length ? [`AVISOS (${avisos.length}):`, ...avisos.map((a) => `- ${a.etiqueta}: ${a.valor}`)] : []),
  ].join('\n');

  const result = await enviarEmail({
    to: process.env.ALERTAS_EMAIL_TO ?? 'pon-aqui-tu-email@dominio.com',
    asunto: `sfbathroom · ${criticas.length} críticas, ${avisos.length} avisos (${anio})`,
    html,
    texto,
  });

  return NextResponse.json({ enviado: result.enviado, razon: result.razon, criticas: criticas.length, avisos: avisos.length });
}

export async function GET(req: Request) {
  return POST(req);
}