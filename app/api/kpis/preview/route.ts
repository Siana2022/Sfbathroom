import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { evaluarKpi } from '@/lib/datos/kpiEval';
import { validarConfig, type KpiConfig } from '@/lib/datos/kpisCatalogo';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

async function rolUsuario(): Promise<string | null> {
  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return perfil?.role ?? null;
}

export async function POST(req: Request) {
  try {
    const rol = await rolUsuario();
    if (!rol || (rol !== 'admin' && rol !== 'direccion')) {
      return NextResponse.json({ error: 'Acceso restringido a admin/dirección.' }, { status: 403 });
    }

    const body = await req.json();
    const cfg = body.cfg as Partial<KpiConfig>;
    const empresaCodigo = (body.empresa as string) ?? 'SF';

    if (!cfg || typeof cfg !== 'object') {
      return NextResponse.json({ error: 'Falta la configuración del KPI.' }, { status: 400 });
    }

    const errorValidacion = validarConfig(cfg);
    if (errorValidacion) {
      return NextResponse.json({ error: errorValidacion }, { status: 400 });
    }

    const resultado = await evaluarKpi(cfg as KpiConfig, empresaCodigo);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error('[api/kpis/preview]', err);
    const msg = err instanceof Error ? err.message : 'Error interno.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}