import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hayServiceRole } from '@/lib/supabase/serviceRole';
import { renderizarEmail, type BloqueEmail } from '@/lib/marketing/bloques';
import { enlaceBaja } from '@/lib/marketing/firma';

const RESEND = 'https://api.resend.com/emails/batch';
const LOTE = 100;

async function quienSoy(): Promise<{ id: string; rol: string | null } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { id: user.id, rol: (data as { role: string | null } | null)?.role ?? null };
}

function parseRemitente(valor: string): string {
  return valor.includes('<') ? valor : `sfbathroom <${valor}>`;
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
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Falta RESEND_API_KEY. El envío se activará cuando se verifique el dominio.' }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    campanaId?: string;
    prueba?: string | null;
    segmento?: { comerciales?: string[]; estado?: string; provincia?: string | null };
  };
  if (!body.campanaId) return NextResponse.json({ error: 'Falta la campaña.' }, { status: 400 });

  const admin = createServiceClient();
  const { data: campana, error } = await admin
    .from('campanas_email')
    .select('id, empresa_id, nombre, asunto, remitente, bloques, segmento, estado')
    .eq('id', body.campanaId)
    .maybeSingle();
  if (error || !campana) return NextResponse.json({ error: 'Campaña no encontrada.' }, { status: 404 });

  const c = campana as {
    creado_por?: string | null;
    id: string;
    empresa_id: string;
    nombre: string;
    asunto: string;
    remitente: string;
    bloques: BloqueEmail[];
    segmento: { comerciales?: string[]; estado?: string; provincia?: string | null };
  };
  if (!c.asunto || (c.bloques ?? []).length === 0) {
    return NextResponse.json({ error: 'La campaña necesita asunto y al menos un bloque.' }, { status: 400 });
  }

  if (yo.rol === 'comercial' && (c as { creado_por?: string | null }).creado_por !== yo.id) {
    return NextResponse.json({ error: 'Esta campaña no es tuya.' }, { status: 403 });
  }

  const base = baseUrl(req);
  const from = parseRemitente(c.remitente);

  if (body.prueba) {
    const html = renderizarEmail(c.bloques, enlaceBaja(body.prueba, base));
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [body.prueba], subject: `[PRUEBA] ${c.asunto}`, html }),
    });
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 400 });
    return NextResponse.json({ ok: true, enviados: 1, fallidos: 0 });
  }

  const seg = { ...(body.segmento ?? c.segmento ?? {}) } as {
    comerciales?: string[];
    estado?: string;
    provincia?: string | null;
  };

  if (yo.rol === 'comercial') {
    const { data: pcs } = await admin
      .from('profiles_comerciales')
      .select('comercial_id')
      .eq('profile_id', yo.id);
    const { data: perfil } = await admin.from('profiles').select('comercial_id').eq('id', yo.id).maybeSingle();
    const propios = [
      ...new Set([
        ...((pcs ?? []) as { comercial_id: string }[]).map((x) => x.comercial_id),
        ...(((perfil as { comercial_id: string | null } | null)?.comercial_id) ? [(perfil as { comercial_id: string }).comercial_id] : []),
      ]),
    ];
    if (propios.length === 0) {
      return NextResponse.json({ error: 'No tienes cartera asignada.' }, { status: 400 });
    }
    seg.comerciales = propios;
  }
  let consulta = admin
    .from('clientes')
    .select('id, email')
    .eq('empresa_id', c.empresa_id)
    .not('email', 'is', null);
  if (seg.comerciales && seg.comerciales.length > 0) consulta = consulta.in('comercial_id', seg.comerciales);
  if (seg.estado === 'activo' || seg.estado === 'inactivo') consulta = consulta.eq('estado', seg.estado);
  if (seg.provincia) consulta = consulta.ilike('provincia', `%${seg.provincia}%`);

  const { data: clientes } = await consulta.limit(5000);
  const lista = (clientes ?? []) as { id: string; email: string | null }[];
  const ids = lista.map((x) => x.id);

  const { data: contactos } = ids.length
    ? await admin.from('clientes_contactos').select('cliente_id, email').in('cliente_id', ids).not('email', 'is', null)
    : { data: [] };

  const destinatarios = new Map<string, string | null>();
  for (const cl of lista) {
    if (cl.email && cl.email.includes('@')) destinatarios.set(cl.email.trim().toLowerCase(), cl.id);
  }
  for (const ct of (contactos ?? []) as { cliente_id: string; email: string | null }[]) {
    if (ct.email && ct.email.includes('@')) destinatarios.set(ct.email.trim().toLowerCase(), ct.cliente_id);
  }

  const { data: bajas } = await admin.from('email_bajas').select('email');
  for (const b of (bajas ?? []) as { email: string }[]) destinatarios.delete(b.email.trim().toLowerCase());

  const emails = [...destinatarios.keys()];
  if (emails.length === 0) return NextResponse.json({ error: 'El segmento no tiene destinatarios con email.' }, { status: 400 });

  await admin.from('campanas_email').update({ estado: 'enviando', total: emails.length, segmento: seg }).eq('id', c.id);

  let enviados = 0;
  let fallidos = 0;

  for (let i = 0; i < emails.length; i += LOTE) {
    const trozo = emails.slice(i, i + LOTE);
    const cuerpo = trozo.map((email) => ({
      from,
      to: [email],
      subject: c.asunto,
      html: renderizarEmail(c.bloques, enlaceBaja(email, base)),
    }));

    const res = await fetch(RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });

    if (res.ok) {
      enviados += trozo.length;
      await admin.from('campana_envios').insert(
        trozo.map((email) => ({ campana_id: c.id, email, cliente_id: destinatarios.get(email) ?? null, estado: 'enviado' })),
      );
    } else {
      const texto = await res.text();
      fallidos += trozo.length;
      await admin.from('campana_envios').insert(
        trozo.map((email) => ({
          campana_id: c.id,
          email,
          cliente_id: destinatarios.get(email) ?? null,
          estado: 'error',
          error: texto.slice(0, 500),
        })),
      );
    }
  }

  await admin
    .from('campanas_email')
    .update({ estado: fallidos === emails.length ? 'borrador' : 'enviada', enviados, fallidos, enviada_at: new Date().toISOString() })
    .eq('id', c.id);

  return NextResponse.json({ ok: true, enviados, fallidos });
}
