import { NextResponse } from 'next/server';
import { contextoDePeticion, errorDeFuncion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { ESTADOS_CRM } from '@/lib/comercial/tipos';

const ESTADOS = ESTADOS_CRM.map((e) => e.valor);

/**
 * Actualiza el estado CRM del cliente y su persona habitual de contacto.
 *
 * Estas dos columnas las mantiene el comercial, pero `clientes` solo deja
 * escribir a admin/direccion: el RLS es por fila y no por columna, así que
 * abrir la tabla le daría también `limite_credito` y compañía. Por eso la
 * escritura pasa por dos funciones en base de datos (`crm_set_estado_cliente`
 * y `crm_set_contacto_habitual`) que comprueban dentro que el cliente es de la
 * cartera del usuario. Ver 0042_crm_comercial_escribe_clientes.sql.
 *
 * Se actualiza solo lo que llega en el cuerpo: mandar la persona habitual no
 * debe borrar el estado, ni al revés.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const tieneEstado = 'estado_crm' in body;
  const tieneHabitual = 'contacto_habitual_id' in body;

  if (!tieneEstado && !tieneHabitual) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  if (tieneEstado) {
    const estado = typeof body.estado_crm === 'string' && body.estado_crm !== '' ? body.estado_crm : null;
    if (estado && !ESTADOS.includes(estado as never)) {
      return NextResponse.json({ error: `Estado no válido: ${estado}` }, { status: 400 });
    }
    const motivo = typeof body.motivo_perdida === 'string' ? body.motivo_perdida.trim() : '';
    const { error } = await supabase.rpc('crm_set_estado_cliente', {
      p_cliente_id: params.id,
      p_estado: estado,
      p_motivo: motivo || null,
    });
    if (error) return errorDeFuncion(error.message);
  }

  if (tieneHabitual) {
    const contactoId =
      typeof body.contacto_habitual_id === 'string' && body.contacto_habitual_id !== ''
        ? body.contacto_habitual_id
        : null;
    const { error } = await supabase.rpc('crm_set_contacto_habitual', {
      p_cliente_id: params.id,
      p_contacto_id: contactoId,
    });
    if (error) return errorDeFuncion(error.message);
  }

  return NextResponse.json({ ok: true });
}
