import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hayServiceRole } from '@/lib/supabase/serviceRole';
import { enviarCampana } from '@/lib/marketing/enviar';

async function quienSoy(): Promise<{ id: string; rol: string | null } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { id: user.id, rol: (data as { role: string | null } | null)?.role ?? null };
}

function baseUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'sfbathroom.com';
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const yo = await quienSoy();
  if (!yo || !['admin', 'direccion', 'comercial'].includes(yo.rol ?? '')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }
  if (!hayServiceRole()) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as {
    campanaId?: string;
    prueba?: string | null;
    segmento?: { comerciales?: string[]; estado?: string; provincia?: string | null; clientes?: string[] };
  };
  if (!body.campanaId) return NextResponse.json({ error: 'Falta la campaña.' }, { status: 400 });

  const admin = createServiceClient();
  const { data: campana } = await admin
    .from('campanas_email')
    .select('id, creado_por')
    .eq('id', body.campanaId)
    .maybeSingle();
  if (!campana) return NextResponse.json({ error: 'Campaña no encontrada.' }, { status: 404 });
  if (yo.rol === 'comercial' && (campana as { creado_por: string | null }).creado_por !== yo.id) {
    return NextResponse.json({ error: 'Esta campaña no es tuya.' }, { status: 403 });
  }

  const seg = { ...(body.segmento ?? {}) };
  if (yo.rol === 'comercial') {
    const { data: pcs } = await admin.from('profiles_comerciales').select('comercial_id').eq('profile_id', yo.id);
    const { data: perfil } = await admin.from('profiles').select('comercial_id').eq('id', yo.id).maybeSingle();
    const propios = [
      ...new Set([
        ...((pcs ?? []) as { comercial_id: string }[]).map((x) => x.comercial_id),
        ...((perfil as { comercial_id: string | null } | null)?.comercial_id
          ? [(perfil as { comercial_id: string }).comercial_id]
          : []),
      ]),
    ];
    if (propios.length === 0) return NextResponse.json({ error: 'No tienes cartera asignada.' }, { status: 400 });
    seg.comerciales = propios;
  }

  const resultado = await enviarCampana({
    campanaId: body.campanaId,
    segmento: seg,
    prueba: body.prueba ?? null,
    base: baseUrl(req),
  });

  if (!resultado.ok) return NextResponse.json({ error: resultado.error ?? 'No se pudo enviar.' }, { status: 400 });
  return NextResponse.json(resultado);
}
