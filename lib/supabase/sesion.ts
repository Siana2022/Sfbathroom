import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getContextoComercial, type ContextoComercial } from '@/lib/datos/comercial';

// URL y clave publishable no son secretas (protegidas por RLS).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

/**
 * Cliente de Supabase con la SESIÓN del usuario, no service_role.
 *
 * Es deliberado: en este módulo los comerciales escriben, así que el RLS debe
 * decidir qué filas se leen y se escriben. Con service_role se saltaría el RLS
 * y un comercial podría tocar la cartera de otro manipulando el body.
 */
export function clienteConSesion() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });
}

type Contexto = {
  supabase: ReturnType<typeof clienteConSesion>;
  contexto: ContextoComercial | null;
};

export async function contextoDePeticion(): Promise<Contexto> {
  const supabase = clienteConSesion();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, contexto: null };
  return { supabase, contexto: await getContextoComercial() };
}

export function noAutenticado() {
  return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
}

export function sinPermiso() {
  return NextResponse.json({ error: 'Sin permiso para esta operación.' }, { status: 403 });
}

/**
 * Traduce el error de una función de base de datos a una respuesta HTTP.
 *
 * Las funciones de 0042 levantan 42501 cuando el cliente no es de la cartera
 * del usuario: eso es un 403, no un 400. Devolverlo como 400 le diría al
 * navegador que "mandó mal" algo que en realidad no le corresponde.
 */
export function errorDeFuncion(message: string) {
  if (message.includes('Sin permiso')) return NextResponse.json({ error: 'Sin permiso para esta operación.' }, { status: 403 });
  if (message.includes('No autenticado')) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  return NextResponse.json({ error: message }, { status: 400 });
}

const CAMPOS_CONTACTO = ['nombre', 'apellidos', 'cargo', 'email', 'telefono', 'movil', 'pais', 'provincia', 'idioma', 'notas'] as const;

/** Saneado del body de un contacto: solo campos conocidos, texto o null. */
export function limpiarContacto(body: Record<string, unknown>, incluirActivo = false): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const k of CAMPOS_CONTACTO) {
    if (k in body) {
      const v = body[k];
      salida[k] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
    }
  }
  if (incluirActivo && 'activo' in body) salida.activo = Boolean(body.activo);
  return salida;
}
