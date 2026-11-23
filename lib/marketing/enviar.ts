import { createServiceClient } from '@/lib/supabase/serviceRole';
import { renderizarEmail, type BloqueEmail } from '@/lib/marketing/bloques';
import { enlaceBaja } from '@/lib/marketing/firma';

const RESEND_BATCH = 'https://api.resend.com/emails/batch';
const RESEND_UNO = 'https://api.resend.com/emails';
const LOTE = 100;

export type Segmento = {
  comerciales?: string[];
  estado?: string;
  provincia?: string | null;
  clientes?: string[];
};

export type ResultadoEnvio = { ok: boolean; enviados: number; fallidos: number; error?: string };

function parseRemitente(valor: string): string {
  return valor.includes('<') ? valor : `sfbathroom <${valor}>`;
}

export async function enviarCampana(opciones: {
  campanaId: string;
  segmento?: Segmento;
  prueba?: string | null;
  base: string;
}): Promise<ResultadoEnvio> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, enviados: 0, fallidos: 0, error: 'Falta RESEND_API_KEY.' };
  }

  const admin = createServiceClient();
  const { data: campana } = await admin
    .from('campanas_email')
    .select('id, empresa_id, nombre, asunto, remitente, bloques, segmento')
    .eq('id', opciones.campanaId)
    .maybeSingle();

  if (!campana) return { ok: false, enviados: 0, fallidos: 0, error: 'Campaña no encontrada.' };

  const c = campana as {
    id: string;
    empresa_id: string;
    nombre: string;
    asunto: string;
    remitente: string;
    bloques: BloqueEmail[];
    segmento: Segmento;
  };

  if (!c.asunto || (c.bloques ?? []).length === 0) {
    return { ok: false, enviados: 0, fallidos: 0, error: 'La campaña necesita asunto y al menos un bloque.' };
  }

  const base = opciones.base.replace(/\/$/, '');
  const from = parseRemitente(c.remitente);

  if (opciones.prueba) {
    const html = renderizarEmail(c.bloques, enlaceBaja(opciones.prueba, base));
    const res = await fetch(RESEND_UNO, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [opciones.prueba], subject: `[PRUEBA] ${c.asunto}`, html }),
    });
    if (!res.ok) return { ok: false, enviados: 0, fallidos: 0, error: await res.text() };
    return { ok: true, enviados: 1, fallidos: 0 };
  }

  const seg: Segmento = { ...(opciones.segmento ?? c.segmento ?? {}) };
  const elegidos = Array.isArray(seg.clientes) ? seg.clientes.filter(Boolean) : [];

  let consulta = admin.from('clientes').select('id, email').eq('empresa_id', c.empresa_id);
  if (elegidos.length > 0) {
    consulta = consulta.in('id', elegidos);
  } else {
    if (seg.comerciales && seg.comerciales.length > 0) consulta = consulta.in('comercial_id', seg.comerciales);
    if (seg.estado === 'activo' || seg.estado === 'inactivo') consulta = consulta.eq('estado', seg.estado);
    if (seg.provincia) consulta = consulta.ilike('provincia', `%${seg.provincia}%`);
  }

  const { data: clientes } = await consulta.limit(5000);
  const lista = (clientes ?? []) as { id: string; email: string | null }[];
  const ids = lista.map((x) => x.id);

  const { data: contactos } = ids.length
    ? await admin.from('clientes_contactos').select('cliente_id, email').in('cliente_id', ids).not('email', 'is', null)
    : { data: [] as { cliente_id: string; email: string | null }[] };

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
  if (emails.length === 0) {
    return { ok: false, enviados: 0, fallidos: 0, error: 'El segmento no tiene destinatarios con email.' };
  }

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

    const res = await fetch(RESEND_BATCH, {
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
    .update({
      estado: fallidos === emails.length ? 'borrador' : 'enviada',
      enviados,
      fallidos,
      enviada_at: new Date().toISOString(),
      programada_para: null,
    })
    .eq('id', c.id);

  return { ok: true, enviados, fallidos };
}
