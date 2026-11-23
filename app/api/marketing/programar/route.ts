import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hayServiceRole } from '@/lib/supabase/serviceRole';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const rol = (perfil as { role: string | null } | null)?.role ?? null;
  if (!['admin', 'direccion', 'comercial'].includes(rol ?? '')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }
  if (!hayServiceRole()) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as {
    campanaId?: string;
    fecha?: string | null;
    segmento?: Record<string, unknown>;
  };
  if (!body.campanaId) return NextResponse.json({ error: 'Falta la campaña.' }, { status: 400 });

  const admin = createServiceClient();
  const { data: campana } = await admin
    .from('campanas_email')
    .select('id, creado_por')
    .eq('id', body.campanaId)
    .maybeSingle();
  if (!campana) return NextResponse.json({ error: 'Campaña no encontrada.' }, { status: 404 });
  if (rol === 'comercial' && (campana as { creado_por: string | null }).creado_por !== user.id) {
    return NextResponse.json({ error: 'Esta campaña no es tuya.' }, { status: 403 });
  }

  const seg = { ...(body.segmento ?? {}) };
  if (rol === 'comercial') {
    const { data: pcs } = await admin.from('profiles_comerciales').select('comercial_id').eq('profile_id', user.id);
    const { data: p } = await admin.from('profiles').select('comercial_id').eq('id', user.id).maybeSingle();
    const propios = [
      ...new Set([
        ...((pcs ?? []) as { comercial_id: string }[]).map((x) => x.comercial_id),
        ...((p as { comercial_id: string | null } | null)?.comercial_id ? [(p as { comercial_id: string }).comercial_id] : []),
      ]),
    ];
    if (propios.length === 0) return NextResponse.json({ error: 'No tienes cartera asignada.' }, { status: 400 });
    seg.comerciales = propios;
  }

  const fecha = body.fecha ? new Date(body.fecha) : null;
  if (body.fecha && Number.isNaN(fecha?.getTime())) {
    return NextResponse.json({ error: 'Fecha no válida.' }, { status: 400 });
  }

  const { error } = await admin
    .from('campanas_email')
    .update({
      segmento: seg,
      programada_para: fecha ? fecha.toISOString() : null,
      estado: fecha ? 'programada' : 'borrador',
    })
    .eq('id', body.campanaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, programada: fecha?.toISOString() ?? null });
}
