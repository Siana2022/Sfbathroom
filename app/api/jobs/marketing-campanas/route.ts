import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/serviceRole';
import { enviarCampana } from '@/lib/marketing/enviar';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secreto = process.env.JOBS_CRON_SECRET;
  const autorizado =
    !secreto ||
    req.headers.get('authorization') === `Bearer ${secreto}` ||
    req.nextUrl.searchParams.get('secret') === secreto;
  if (!autorizado) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const admin = createServiceClient();
  const ahora = new Date().toISOString();
  const { data } = await admin
    .from('campanas_email')
    .select('id, segmento')
    .eq('estado', 'programada')
    .lte('programada_para', ahora)
    .limit(10);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sfbathroom-bi.vercel.app';
  const resultados: { id: string; enviados: number; fallidos: number; error?: string }[] = [];

  for (const c of (data ?? []) as { id: string; segmento: Record<string, unknown> }[]) {
    const r = await enviarCampana({ campanaId: c.id, segmento: c.segmento, base });
    resultados.push({ id: c.id, enviados: r.enviados, fallidos: r.fallidos, error: r.error });
  }

  return NextResponse.json({ ok: true, procesadas: resultados.length, resultados });
}
