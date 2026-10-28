import { NextResponse } from 'next/server';
import { contextoDePeticion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { ESTADOS_CRM } from '@/lib/comercial/tipos';

const ESTADOS = ESTADOS_CRM.map((e) => e.valor);

/**
 * Fija el estado CRM de un cliente (y su motivo, si se marca como perdido).
 *
 * Es el estado que decide el comercial, no el que se deduce de los pedidos:
 * por eso vive en `clientes.estado_crm` y no toca `clientes.estado`, que lo
 * calcula el ERP y alimenta el semáforo de fuga. El upsert de A3ERP no
 * sobrescribe estas columnas, así que lo que se escriba aquí se mantiene.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const estado = typeof body.estado_crm === 'string' && body.estado_crm !== '' ? body.estado_crm : null;
  if (estado && !ESTADOS.includes(estado as never)) {
    return NextResponse.json({ error: `Estado no válido: ${estado}` }, { status: 400 });
  }

  const motivo = typeof body.motivo_perdida === 'string' ? body.motivo_perdida.trim() : '';

  // El motivo solo tiene sentido si el cliente queda como perdido: en
  // cualquier otro caso se limpia, para no arrastrar un motivo viejo.
  const update: Record<string, unknown> = {
    estado_crm: estado,
    motivo_perdida: estado === 'perdido' && motivo !== '' ? motivo : null,
  };

  const { data, error } = await supabase
    .from('clientes')
    .update(update)
    .eq('id', params.id)
    .select('id, estado_crm, motivo_perdida')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
