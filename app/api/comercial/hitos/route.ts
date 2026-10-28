import { NextResponse } from 'next/server';
import { contextoDePeticion, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

/**
 * Alta de un hito de cliente.
 *
 * El RLS de `hitos` ya impide que un comercial escriba sobre un cliente que no
 * es de su cartera; aquí solo se valida la forma del body.
 */
export async function POST(req: Request) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const clienteId = typeof body.cliente_id === 'string' ? body.cliente_id.trim() : '';
  if (!clienteId) return NextResponse.json({ error: 'Falta cliente_id.' }, { status: 400 });

  const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
  if (!titulo) return NextResponse.json({ error: 'El título del hito es obligatorio.' }, { status: 400 });
  if (titulo.length > 200) {
    return NextResponse.json({ error: 'El título no puede pasar de 200 caracteres.' }, { status: 400 });
  }

  // La fecha es opcional: si no llega, el hito es de hoy. Se acepta una fecha
  // pasada a propósito (acuerdos de hace semanas que se anotan ahora).
  let fecha: string | null = null;
  if (typeof body.fecha === 'string' && body.fecha.trim() !== '') {
    const f = body.fecha.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
      return NextResponse.json({ error: 'La fecha debe tener el formato AAAA-MM-DD.' }, { status: 400 });
    }
    fecha = f;
  }

  const empresa = await getEmpresaPorCodigo((body.empresa_codigo as string) || 'SF');

  const { data, error } = await supabase
    .from('hitos')
    .insert({
      cliente_id: clienteId,
      empresa_id: empresa.id,
      comercial_id: contexto.esComercial ? contexto.comercialId : (body.comercial_id as string) || null,
      usuario_id: contexto.userId,
      fecha: fecha ?? new Date().toISOString().slice(0, 10),
      titulo,
      detalle: typeof body.detalle === 'string' && body.detalle.trim() !== '' ? body.detalle.trim() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
