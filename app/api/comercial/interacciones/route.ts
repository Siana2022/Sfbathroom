import { NextResponse } from 'next/server';
import { contextoDePeticion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { TIPOS_INTERACCION, RESULTADOS_INTERACCION } from '@/lib/comercial/tipos';

const TIPOS = TIPOS_INTERACCION.map((t) => t.valor);
const RESULTADOS = RESULTADOS_INTERACCION.map((r) => r.valor);

/** Alta de una interacción (llamada, email, reunión, visita o nota). */
export async function POST(req: Request) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clienteId = typeof body.cliente_id === 'string' ? body.cliente_id : '';
  const contenido = typeof body.contenido === 'string' ? body.contenido.trim() : '';
  if (!clienteId) return NextResponse.json({ error: 'Falta cliente_id.' }, { status: 400 });
  if (!contenido) return NextResponse.json({ error: 'El contenido es obligatorio.' }, { status: 400 });

  const tipo = (typeof body.tipo === 'string' ? body.tipo : 'nota') as string;
  if (!TIPOS.includes(tipo as never)) {
    return NextResponse.json({ error: `Tipo no válido: ${tipo}` }, { status: 400 });
  }
  const resultado = typeof body.resultado === 'string' && body.resultado !== '' ? body.resultado : null;
  if (resultado && !RESULTADOS.includes(resultado as never)) {
    return NextResponse.json({ error: `Resultado no válido: ${resultado}` }, { status: 400 });
  }

  const empresa = await getEmpresaPorCodigo((body.empresa_codigo as string) || 'SF');
  const duracion = body.duracion_min === null || body.duracion_min === undefined || body.duracion_min === ''
    ? null
    : Number(body.duracion_min);

  const { data, error } = await supabase
    .from('interacciones')
    .insert({
      cliente_id: clienteId,
      contacto_id: typeof body.contacto_id === 'string' && body.contacto_id !== '' ? body.contacto_id : null,
      empresa_id: empresa.id,
      comercial_id: contexto.esComercial ? contexto.comercialId : (body.comercial_id as string) || null,
      usuario_id: contexto.userId,
      tipo,
      asunto: typeof body.asunto === 'string' && body.asunto.trim() !== '' ? body.asunto.trim() : null,
      contenido,
      resultado,
      duracion_min: duracion !== null && !Number.isNaN(duracion) ? duracion : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
