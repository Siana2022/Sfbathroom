import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { validarConfig, type KpiConfig } from '@/lib/datos/kpisCatalogo';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

function crearCliente() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
}

export async function POST(req: Request) {
  try {
    const supabase = crearCliente();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const rol = perfil?.role ?? null;
    if (rol !== 'admin' && rol !== 'direccion') {
      return NextResponse.json({ error: 'Acceso restringido a admin/dirección.' }, { status: 403 });
    }

    const body = await req.json();
    const cfg = body.cfg as Partial<KpiConfig>;
    const empresaCodigo = body.empresa as string;
    if (!cfg || typeof cfg !== 'object') {
      return NextResponse.json({ error: 'Falta la configuración del KPI.' }, { status: 400 });
    }
    const errorValidacion = validarConfig(cfg);
    if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 });

    const empresa = await getEmpresaPorCodigo(empresaCodigo);

    const insert = {
      empresa_id: empresa.id,
      nombre: cfg.nombre!.trim(),
      metrica: cfg.metrica!,
      calculo: cfg.calculo!,
      filtros: cfg.filtros ?? {},
      objetivo: cfg.objetivo ?? null,
      objetivo_op: cfg.objetivo_op ?? 'gte',
      formato: cfg.formato!,
      visible_para: cfg.visible_para ?? 'direccion',
      propietario: user.id,
    };

    const { data, error } = await supabase.from('kpis_personalizados').insert(insert).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/kpis]', err);
    const msg = err instanceof Error ? err.message : 'Error interno.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = crearCliente();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const rol = perfil?.role ?? null;
    if (rol !== 'admin' && rol !== 'direccion') {
      return NextResponse.json({ error: 'Acceso restringido a admin/dirección.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });

    const empresa = await getEmpresaPorCodigo(url.searchParams.get('empresa') ?? 'SF');
    const { error } = await supabase.from('kpis_personalizados').delete().eq('id', id).eq('empresa_id', empresa.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/kpis]', err);
    const msg = err instanceof Error ? err.message : 'Error interno.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}