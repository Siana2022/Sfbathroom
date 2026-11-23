import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, hayServiceRole } from '@/lib/supabase/serviceRole';

export const dynamic = 'force-dynamic';

const TIPO: Record<string, 'apertura' | 'clic' | 'rebote' | 'queja' | 'entrega' | null> = {
  'email.opened': 'apertura',
  'email.clicked': 'clic',
  'email.bounced': 'rebote',
  'email.complained': 'queja',
  'email.delivered': 'entrega',
};

function firmaValida(cuerpo: string, id: string, timestamp: string, firma: string): boolean {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;
  if (!secreto) return false;
  const esperado = createHmac('sha256', secreto).update(`${id}.${timestamp}.${cuerpo}`).digest('base64');
  const recibidas = firma.split(' ').map((f) => f.split(',')[1]).filter(Boolean);
  return recibidas.some((f) => {
    try {
      return timingSafeEqual(Buffer.from(f), Buffer.from(esperado));
    } catch {
      return false;
    }
  });
}

export async function POST(req: NextRequest) {
  const cuerpo = await req.text();
  const id = req.headers.get('svix-id') ?? '';
  const timestamp = req.headers.get('svix-timestamp') ?? '';
  const firma = req.headers.get('svix-signature') ?? '';
  if (!firmaValida(cuerpo, id, timestamp, firma)) {
    return NextResponse.json({ error: 'Firma no válida.' }, { status: 401 });
  }
  if (!hayServiceRole()) return NextResponse.json({ error: 'Sin service role.' }, { status: 500 });

  const evento = JSON.parse(cuerpo) as {
    type?: string;
    data?: { email_id?: string; to?: string[]; tags?: { name: string; value: string }[]; click?: { link?: string } };
  };
  const tipo = evento.type ? TIPO[evento.type] : null;
  if (!tipo) return NextResponse.json({ ok: true, ignorado: true });

  const campanaId = evento.data?.tags?.find((t) => t.name === 'campana')?.value ?? null;
  const email = evento.data?.to?.[0] ?? null;
  const url = evento.data?.click?.link ?? null;

  const admin = createServiceClient();
  await admin.from('campana_eventos').insert({
    campana_id: campanaId,
    email,
    tipo,
    url,
    evento_id: `${id}-${evento.type ?? ''}-${evento.data?.email_id ?? ''}`,
  });
  return NextResponse.json({ ok: true });
}
