import { NextResponse } from 'next/server';
import { contextoDePeticion, limpiarContacto, noAutenticado, sinPermiso } from '@/lib/supabase/sesion';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

/** Alta de contacto. El RLS comprueba que el cliente pertenece a la cartera. */
export async function POST(req: Request) {
  const { supabase, contexto } = await contextoDePeticion();
  if (!contexto) return noAutenticado();
  if (!contexto.puedeEscribir) return sinPermiso();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clienteId = typeof body.cliente_id === 'string' ? body.cliente_id : '';
  if (!clienteId) return NextResponse.json({ error: 'Falta cliente_id.' }, { status: 400 });

  const datos = limpiarContacto(body);
  if (!datos.nombre) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });

  const empresa = await getEmpresaPorCodigo((body.empresa_codigo as string) || 'SF');

  const { data, error } = await supabase
    .from('contactos')
    .insert({
      ...datos,
      cliente_id: clienteId,
      empresa_id: empresa.id,
      // Si lo crea un comercial, el contacto queda en su cartera.
      comercial_id: contexto.esComercial ? contexto.comercialId : (body.comercial_id as string) || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
