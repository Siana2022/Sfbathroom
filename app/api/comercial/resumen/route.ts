import { NextResponse } from 'next/server';
import { contextoDePeticion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { resumirInteracciones } from '@/lib/datos/comercial';

/**
 * Resumen o conclusiones del histórico de un cliente, con IA.
 *
 * Dos garantías:
 *  1. Las interacciones se leen con la SESIÓN del usuario, así que el RLS
 *     decide qué histórico se puede resumir. No se usa service_role.
 *  2. El resultado se persiste en `interacciones` solo si el usuario puede
 *     escribir en esa fila (el RLS lo comprueba en el update).
 */
export async function POST(req: Request) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clienteId = typeof body.cliente_id === 'string' ? body.cliente_id : '';
  const interaccionId = typeof body.interaccion_id === 'string' ? body.interaccion_id : '';
  const modo = body.modo === 'conclusiones' ? 'conclusiones' : 'resumen';
  if (!clienteId) return NextResponse.json({ error: 'Falta cliente_id.' }, { status: 400 });

  const { data: cli } = await supabase.from('clientes').select('nombre').eq('id', clienteId).maybeSingle();
  const nombreCliente = (cli?.nombre as string | undefined) ?? 'Cliente';

  // El histórico visible lo determina el RLS.
  const { data: filas, error: errLectura } = await supabase
    .from('interacciones')
    .select('id, fecha, tipo, asunto, contenido, resultado')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
    .limit(40);
  if (errLectura) return NextResponse.json({ error: errLectura.message }, { status: 400 });

  const historico = (filas ?? []) as { id: string; fecha: string; tipo: string; asunto: string | null; contenido: string; resultado: string | null }[];
  if (historico.length === 0) {
    return NextResponse.json({ error: 'No hay interacciones que resumir para este cliente.' }, { status: 400 });
  }

  let texto: string;
  try {
    texto = await resumirInteracciones(nombreCliente, historico, modo);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error del proveedor de IA.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  if (!texto) return NextResponse.json({ error: 'La IA no devolvió texto.' }, { status: 502 });

  const ahora = new Date().toISOString();

  // Si viene una interacción concreta, se guarda ahí; si no, en la más reciente.
  const destino = interaccionId && historico.some((h) => h.id === interaccionId) ? interaccionId : historico[0].id;
  const update = modo === 'resumen'
    ? { resumen_ia: texto, resumen_generado_at: ahora }
    : { conclusiones_ia: texto, resumen_generado_at: ahora };

  const { error: errGuardado } = await supabase.from('interacciones').update(update).eq('id', destino);

  // Si no se pudo persistir (p. ej. fila de otra cartera), se devuelve igual:
  // el texto ya está calculado y el usuario lo ve.
  return NextResponse.json({
    texto,
    modo,
    interaccion_id: destino,
    guardado: !errGuardado,
    aviso: errGuardado ? 'El texto no se pudo guardar en el histórico.' : null,
  });
}
