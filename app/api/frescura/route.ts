import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const hoy = new Date().toISOString().slice(0, 10);
  const { data: job } = await supabase
    .from('jobs_ejecutados')
    .select('clave, estado, iniciado_en')
    .eq('fecha', hoy)
    .order('iniciado_en', { ascending: false })
    .limit(1);
  const ultimo = job?.[0] ?? null;

  const { data: factura } = await supabase.from('facturas').select('fecha').order('fecha', { ascending: false }).limit(1);
  const ultimaFactura = factura?.[0]?.fecha ?? null;

  const hace = ultimo?.iniciado_en ? Math.round((Date.now() - Date.parse(ultimo.iniciado_en as string)) / 60000) : null;
  const staleness = hace == null ? 'sin-execución' : hace < 90 ? 'al-dia' : hace < 1440 ? 'aviso' : 'atrasado';

  return NextResponse.json({
    ultimoJob: ultimo,
    haceMin: hace,
    staleness,
    ultimaFactura,
  });
}