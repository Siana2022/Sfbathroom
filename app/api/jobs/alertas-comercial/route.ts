import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/serviceRole';
import { enviarEmail } from '@/lib/datos/email';

export const maxDuration = 60;

const JOBS_SECRET = process.env.JOBS_CRON_SECRET;

function autorizado(req: NextRequest): boolean {
  if (!JOBS_SECRET) return false;
  if (req.headers.get('authorization') === `Bearer ${JOBS_SECRET}`) return true;
  return new URL(req.url).searchParams.get('secret') === JOBS_SECRET;
}

const eur = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`;

/**
 * Resumen diario de alertas críticas de cartera (mora alta y pedidos con
 * entrega pasada). Se envía a ALERTAS_EMAIL_TO. Requiere JOBS_CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const supabase = createServiceClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: empresas } = await supabase.from('empresas').select('id, nombre');
  const lineas: string[] = [];

  for (const e of (empresas ?? []) as { id: string; nombre: string }[]) {
    const { data: cobros } = await supabase
      .from('cobros_cartera')
      .select('pendiente')
      .eq('empresa_id', e.id)
      .lt('fecha_vencimiento', hoy)
      .gt('pendiente', 10000);

    const { count: pedidos } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', e.id)
      .eq('estado', 'pendiente')
      .lt('fecha_prometida', hoy);

    const mora = ((cobros ?? []) as { pendiente: number }[]).reduce((s, c) => s + Number(c.pendiente ?? 0), 0);
    const partidas = (cobros ?? []).length;

    if (mora > 0 || (pedidos ?? 0) > 0) {
      lineas.push(
        `· <strong>${e.nombre}</strong>: ${eur(mora)} en mora de más de 10.000 € (${partidas} partidas) y ${
          pedidos ?? 0
        } pedidos con entrega pasada.`,
      );
    }
  }

  if (lineas.length === 0) {
    return NextResponse.json({ ok: true, enviado: false, motivo: 'sin críticas' });
  }

  const to = process.env.ALERTAS_EMAIL_TO ?? '';
  if (!to) {
    return NextResponse.json({ ok: true, enviado: false, motivo: 'sin destinatario', lineas });
  }

  const res = await enviarEmail({
    to: to.split(',').map((s) => s.trim()).filter(Boolean),
    asunto: `Alertas críticas de cartera · ${hoy}`,
    html: `<p>Resumen de alertas críticas:</p><ul>${lineas.map((l) => `<li>${l}</li>`).join('')}</ul>`,
    texto: lineas.join('\n'),
  });

  return NextResponse.json({ ok: true, enviado: res.enviado, lineas });
}
