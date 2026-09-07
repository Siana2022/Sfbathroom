import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { consult } from '@/lib/agente/agent';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

export async function POST(req: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const empresa = cookieStore.get('sfb_empresa')?.value ?? 'SF';
    const rol = perfil?.role ?? undefined;

    const body = await req.json();
    const mensajes: { role: 'user' | 'assistant'; content: string }[] = body.mensajes;
    if (!Array.isArray(mensajes) || mensajes.length === 0) {
      return NextResponse.json({ error: 'Debes enviar al menos un mensaje.' }, { status: 400 });
    }

    const resultado = await consult(empresa, rol, mensajes);
    return NextResponse.json({ texto: resultado.texto, datos: resultado.datos });
  } catch (err: unknown) {
    console.error('[chat/api]', err);
    const msg = err instanceof Error ? err.message : 'Error interno del servidor.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}