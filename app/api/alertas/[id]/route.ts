import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

async function clienteConRol(): Promise<{ supabase: ReturnType<typeof createServerClient>; rol: string | null; userId: string | null }> {
  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  let rol: string | null = null;
  if (user) {
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    rol = perfil?.role ?? null;
  }
  return { supabase, rol, userId: user?.id ?? null };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, rol, userId } = await clienteConRol();
  if (rol !== 'admin' && rol !== 'direccion') {
    return NextResponse.json({ error: 'Solo admin/dirección.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const estado = body?.estado as string | undefined;
  const asignadaA = body?.asignada_a as string | undefined;

  const validos = ['nueva', 'revisada', 'pospuesta', 'descartada'];
  if (estado && !validos.includes(estado)) {
    return NextResponse.json({ error: `Estado no válido: ${estado}` }, { status: 400 });
  }

  const update: Record<string, unknown> = { fecha_estado: new Date().toISOString() };
  if (estado) update.estado = estado;
  if (asignadaA !== undefined) update.asignada_a = asignadaA || null;
  if (body?.marca_leida === true) update.leida = true;

  const { data, error } = await supabase
    .from('alertas_generadas')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { supabase, rol } = await clienteConRol();
  if (rol !== 'admin' && rol !== 'direccion') {
    return NextResponse.json({ error: 'Solo admin/dirección.' }, { status: 403 });
  }
  const { error } = await supabase.from('alertas_generadas').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}