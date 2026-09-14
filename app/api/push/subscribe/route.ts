import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

export const dynamic = 'force-dynamic';

async function cliente() {
  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  return supabase;
}

export async function POST(req: Request) {
  const supabase = await cliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = body?.endpoint as string | undefined;
  const keys = body?.keys as { p256dh?: string; auth?: string } | undefined;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Faltan endpoint o claves.' }, { status: 400 });
  }

  // upsert: si el endpoint ya existe de otro usuario, lo reasigna
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        usuario_id: user.id,
        endpoint,
        keys_p256dh: keys.p256dh,
        keys_auth: keys.auth,
        ultimo_uso: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req: Request) {
  const supabase = await cliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'Falta endpoint.' }, { status: 400 });

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('usuario_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}