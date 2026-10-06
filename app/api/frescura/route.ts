import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

export async function GET(req: Request) {
  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const url = new URL(req.url);
  const empresa = url.searchParams.get('empresa') ?? 'SF';

  const { data: emp } = await supabase
    .from('empresas')
    .select('id')
    .eq('codigo', empresa)
    .maybeSingle();

  if (!emp) return NextResponse.json({ empresa, ultimaFactura: null });

  const { data: factura } = await supabase
    .from('facturas')
    .select('fecha')
    .eq('empresa_id', emp.id)
    .order('fecha', { ascending: false })
    .limit(1);

  return NextResponse.json({ empresa, ultimaFactura: factura?.[0]?.fecha ?? null });
}