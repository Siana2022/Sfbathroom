import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

async function clienteConSesion() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
}

export async function GET() {
  const supabase = await clienteConSesion();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { data } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('usuario_id', user.id)
    .order('fecha', { ascending: false })
    .limit(50);

  return NextResponse.json({ notificaciones: data ?? [] });
}

export async function PATCH(req: Request) {
  const supabase = await clienteConSesion();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids = (body?.ids as string[] | undefined) ?? [];
  const soloUltimas = Boolean(body?.todas);

  let q = supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('usuario_id', user.id)
    .eq('leida', false);

  if (soloUltimas) {
    // marcar todas no leídas (sin filtro por id)
  } else if (ids.length > 0) {
    q = q.in('id', ids);
  } else {
    return NextResponse.json({ ok: true });
  }

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}