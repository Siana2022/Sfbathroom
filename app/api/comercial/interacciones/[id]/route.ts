import { NextResponse } from 'next/server';
import { contextoDePeticion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { TIPOS_INTERACCION, RESULTADOS_INTERACCION } from '@/lib/comercial/tipos';

const TIPOS = TIPOS_INTERACCION.map((t) => t.valor);
const RESULTADOS = RESULTADOS_INTERACCION.map((r) => r.valor);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ('tipo' in body) {
    if (typeof body.tipo !== 'string' || !TIPOS.includes(body.tipo as never)) {
      return NextResponse.json({ error: 'Tipo no válido.' }, { status: 400 });
    }
    update.tipo = body.tipo;
  }
  if ('resultado' in body) {
    const r = typeof body.resultado === 'string' && body.resultado !== '' ? body.resultado : null;
    if (r && !RESULTADOS.includes(r as never)) {
      return NextResponse.json({ error: 'Resultado no válido.' }, { status: 400 });
    }
    update.resultado = r;
  }
  if ('contenido' in body) {
    const c = typeof body.contenido === 'string' ? body.contenido.trim() : '';
    if (!c) return NextResponse.json({ error: 'El contenido no puede estar vacío.' }, { status: 400 });
    update.contenido = c;
  }
  for (const k of ['asunto', 'contacto_id'] as const) {
    if (k in body) update[k] = typeof body[k] === 'string' && (body[k] as string).trim() !== '' ? (body[k] as string).trim() : null;
  }
  if ('duracion_min' in body) {
    const d = body.duracion_min === null || body.duracion_min === '' ? null : Number(body.duracion_min);
    update.duracion_min = d !== null && !Number.isNaN(d) ? d : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  const { data, error } = await supabase.from('interacciones').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const { error } = await supabase.from('interacciones').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
