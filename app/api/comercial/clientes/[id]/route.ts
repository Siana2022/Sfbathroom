import { NextResponse } from 'next/server';
import { contextoDePeticion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { ESTADOS_CRM } from '@/lib/comercial/tipos';

const ESTADOS = ESTADOS_CRM.map((e) => e.valor);

/**
 * Actualiza el estado CRM del cliente y su persona habitual de contacto.
 *
 * El estado CRM lo decide el comercial, no se deduce de los pedidos: por eso
 * vive en `clientes.estado_crm` y no toca `clientes.estado`, que lo calcula el
 * ERP y alimenta el semáforo de fuga. El upsert de A3ERP no sobrescribe estas
 * columnas, así que lo que se escriba aquí se mantiene.
 *
 * Se actualiza solo lo que llega en el cuerpo. Antes bastaba con mandar
 * `estado_crm`, pero la ficha también guarda aquí la persona habitual: si esta
 * llamada borrase lo que no le mandan, marcar el contacto habitual dejaría al
 * cliente sin estado.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ('estado_crm' in body) {
    const estado = typeof body.estado_crm === 'string' && body.estado_crm !== '' ? body.estado_crm : null;
    if (estado && !ESTADOS.includes(estado as never)) {
      return NextResponse.json({ error: `Estado no válido: ${estado}` }, { status: 400 });
    }
    const motivo = typeof body.motivo_perdida === 'string' ? body.motivo_perdida.trim() : '';
    update.estado_crm = estado;
    // El motivo solo tiene sentido si el cliente queda como perdido: en
    // cualquier otro caso se limpia, para no arrastrar un motivo viejo.
    update.motivo_perdida = estado === 'perdido' && motivo !== '' ? motivo : null;
  }

  if ('contacto_habitual_id' in body) {
    const contactoId =
      typeof body.contacto_habitual_id === 'string' && body.contacto_habitual_id !== ''
        ? body.contacto_habitual_id
        : null;
    if (contactoId) {
      // El contacto tiene que ser de este cliente: si no, la cartera mostraría
      // a una persona que no es de la empresa que se está llamando.
      const { data: c } = await supabase
        .from('contactos')
        .select('id')
        .eq('id', contactoId)
        .eq('cliente_id', params.id)
        .maybeSingle();
      if (!c) return NextResponse.json({ error: 'El contacto no pertenece a este cliente.' }, { status: 400 });
    }
    update.contacto_habitual_id = contactoId;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('clientes')
    .update(update)
    .eq('id', params.id)
    .select('id, estado_crm, motivo_perdida, contacto_habitual_id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
