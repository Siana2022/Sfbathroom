import { NextResponse } from 'next/server';
import { contextoDePeticion, errorDeFuncion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { MODALIDADES_REUNION, ESTADOS_REUNION, RESULTADOS_INTERACCION, ESTADOS_CRM } from '@/lib/comercial/tipos';

const MODALIDADES = MODALIDADES_REUNION.map((m) => m.valor);
const ESTADOS = ESTADOS_REUNION.map((e) => e.valor);
const RESULTADOS = RESULTADOS_INTERACCION.map((r) => r.valor);

/**
 * Actualiza una reunión. Además del cambio de campos, admite cerrarla:
 * `volcar_interaccion: true` crea la interacción correspondiente en el
 * histórico y la enlaza, para que el comercial no tenga que escribir dos
 * veces el resultado de la misma reunión.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ('estado' in body) {
    if (typeof body.estado !== 'string' || !ESTADOS.includes(body.estado as never)) {
      return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 });
    }
    update.estado = body.estado;
  }
  if ('fecha_hora' in body) {
    const t = typeof body.fecha_hora === 'string' ? Date.parse(body.fecha_hora) : NaN;
    if (Number.isNaN(t)) return NextResponse.json({ error: 'Fecha y hora no válidas.' }, { status: 400 });
    update.fecha_hora = new Date(t).toISOString();
  }
  if ('modalidad' in body) {
    const m = typeof body.modalidad === 'string' && body.modalidad !== '' ? body.modalidad : null;
    if (m && !MODALIDADES.includes(m as never)) {
      return NextResponse.json({ error: 'Modalidad no válida.' }, { status: 400 });
    }
    update.modalidad = m;
    // El texto libre acompaña a "otros": si se cambia de modalidad, se limpia.
    update.modalidad_otro =
      m === 'otros' && typeof body.modalidad_otro === 'string' && body.modalidad_otro.trim() !== ''
        ? body.modalidad_otro.trim()
        : null;
  }
  for (const k of ['asunto', 'notas'] as const) {
    if (k in body) {
      update[k] = typeof body[k] === 'string' && (body[k] as string).trim() !== '' ? (body[k] as string).trim() : null;
    }
  }
  if ('contacto_id' in body || 'contacto_nombre' in body) {
    const id = typeof body.contacto_id === 'string' && body.contacto_id.trim() !== '' ? body.contacto_id.trim() : null;
    const nombre =
      typeof body.contacto_nombre === 'string' && body.contacto_nombre.trim() !== '' ? body.contacto_nombre.trim() : null;
    update.contacto_id = id;
    // Igual que al crear: si hay contacto de la ficha, el nombre a mano se
    // limpia; si no, se guarda como respaldo.
    update.contacto_nombre = id ? null : nombre;
  }
  if ('duracion_min' in body) {
    const d = body.duracion_min === null || body.duracion_min === '' ? null : Number(body.duracion_min);
    update.duracion_min = d !== null && !Number.isNaN(d) ? d : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  // Necesitamos los datos de la reunión para poder volcarla al histórico.
  const { data: actual, error: errLectura } = await supabase
    .from('reuniones')
    .select('id, cliente_id, contacto_id, comercial_id, usuario_id, empresa_id, fecha_hora, duracion_min, asunto, modalidad, estado, notas, interaccion_id')
    .eq('id', params.id)
    .maybeSingle();
  if (errLectura) return NextResponse.json({ error: errLectura.message }, { status: 400 });
  if (!actual) return NextResponse.json({ error: 'Reunión no encontrada.' }, { status: 404 });

  const volcar = body.volcar_interaccion === true;
  const estadoFinal = (update.estado as string | undefined) ?? actual.estado;

  // La pestaña de seguimiento revisa una reunión cerrada y, en el mismo gesto,
  // fija el estado CRM del cliente. Se admite aquí para que el comercial no
  // tenga que hacer dos peticiones para una sola decisión.
  const estadoCrm = typeof body.estado_crm === 'string' && body.estado_crm !== '' ? body.estado_crm : null;
  if (estadoCrm && !ESTADOS_CRM.map((e) => e.valor).includes(estadoCrm as never)) {
    return NextResponse.json({ error: `Estado CRM no válido: ${estadoCrm}` }, { status: 400 });
  }

  // Solo se vuelca al histórico al cerrar como realizada, y una sola vez.
  if (volcar && estadoFinal === 'realizada' && !actual.interaccion_id) {
    const contenido =
      typeof body.contenido_interaccion === 'string' && body.contenido_interaccion.trim() !== ''
        ? body.contenido_interaccion.trim()
        : actual.notas || actual.asunto || 'Reunión realizada';

    const resultado = typeof body.resultado === 'string' && body.resultado !== '' ? body.resultado : null;
    if (resultado && !RESULTADOS.includes(resultado as never)) {
      return NextResponse.json({ error: 'Resultado no válido.' }, { status: 400 });
    }

    const { data: inter, error: errInter } = await supabase
      .from('interacciones')
      .insert({
        cliente_id: actual.cliente_id,
        contacto_id: actual.contacto_id,
        empresa_id: actual.empresa_id,
        comercial_id: actual.comercial_id,
        usuario_id: contexto.userId,
        tipo: 'reunion',
        // Se conserva la hora de la reunión, no solo el día.
        fecha: actual.fecha_hora,
        asunto: actual.asunto,
        contenido,
        resultado,
        duracion_min: actual.duracion_min,
      })
      .select('id')
      .single();

    if (errInter) return NextResponse.json({ error: errInter.message }, { status: 400 });
    update.interaccion_id = inter.id;
  }

  const { data, error } = await supabase.from('reuniones').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // El estado CRM del cliente se aplica después de guardar la reunión: si algo
  // falla en la reunión, no se queda un estado cambiado a medias. Va por la
  // función de 0042 porque `clientes` no se puede escribir como comercial.
  if (estadoCrm) {
    const motivo = typeof body.motivo_perdida === 'string' ? body.motivo_perdida.trim() : '';
    const { error: errCli } = await supabase.rpc('crm_set_estado_cliente', {
      p_cliente_id: actual.cliente_id,
      p_estado: estadoCrm,
      p_motivo: motivo || null,
    });
    if (errCli) return errorDeFuncion(errCli.message);
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const { error } = await supabase.from('reuniones').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
