import { NextResponse } from 'next/server';
import { contextoDePeticion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { MODALIDADES_REUNION, ESTADOS_REUNION } from '@/lib/comercial/tipos';

const MODALIDADES = MODALIDADES_REUNION.map((m) => m.valor);
const ESTADOS = ESTADOS_REUNION.map((e) => e.valor);

/** Alta de una reunión en la agenda. */
export async function POST(req: Request) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clienteId = typeof body.cliente_id === 'string' ? body.cliente_id : '';
  if (!clienteId) return NextResponse.json({ error: 'Falta cliente_id.' }, { status: 400 });

  const fechaHora = typeof body.fecha_hora === 'string' ? body.fecha_hora.trim() : '';
  if (!fechaHora) return NextResponse.json({ error: 'La fecha y hora son obligatorias.' }, { status: 400 });
  const t = Date.parse(fechaHora);
  if (Number.isNaN(t)) return NextResponse.json({ error: 'Fecha y hora no válidas.' }, { status: 400 });

  const modalidad = typeof body.modalidad === 'string' && body.modalidad !== '' ? body.modalidad : null;
  if (modalidad && !MODALIDADES.includes(modalidad as never)) {
    return NextResponse.json({ error: `Modalidad no válida: ${modalidad}` }, { status: 400 });
  }

  const estado = typeof body.estado === 'string' && body.estado !== '' ? body.estado : 'programada';
  if (!ESTADOS.includes(estado as never)) {
    return NextResponse.json({ error: `Estado no válido: ${estado}` }, { status: 400 });
  }

  const duracion =
    body.duracion_min === null || body.duracion_min === undefined || body.duracion_min === ''
      ? null
      : Number(body.duracion_min);

  const empresa = await getEmpresaPorCodigo((body.empresa_codigo as string) || 'SF');

  const { data, error } = await supabase
    .from('reuniones')
    .insert({
      cliente_id: clienteId,
      contacto_id: typeof body.contacto_id === 'string' && body.contacto_id !== '' ? body.contacto_id : null,
      empresa_id: empresa.id,
      comercial_id: contexto.esComercial ? contexto.comercialId : (body.comercial_id as string) || null,
      usuario_id: contexto.userId,
      fecha_hora: new Date(t).toISOString(),
      duracion_min: duracion !== null && !Number.isNaN(duracion) ? duracion : null,
      asunto: typeof body.asunto === 'string' && body.asunto.trim() !== '' ? body.asunto.trim() : null,
      modalidad,
      estado,
      notas: typeof body.notas === 'string' && body.notas.trim() !== '' ? body.notas.trim() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
