import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

export const dynamic = 'force-dynamic';

async function cliente() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
}

type Resultado = {
  clientes: { id: string; nombre: string; codigo: string | null; commercial: string | null }[];
  facturas: { id: string; numero: string | null; fecha: string; cliente: string | null }[];
  articulos: { id: string; nombre: string; codigo: string | null; familia: string | null }[];
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ clientes: [], facturas: [], articulos: [] });
  }

  const supabase = await cliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const like = `%${q}%`;
  const cols = 'id, nombre, codigo_erp, empresa_id';

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, codigo_erp')
    .or(`nombre.ilike.${like},codigo_erp.ilike.${like},cif.ilike.${like}`)
    .limit(12);

  const { data: facturasRaw } = await supabase
    .from('facturas')
    .select('id, numero_erp, fecha, cliente_id, clientes:cliente_id(nombre)')
    .or(`numero_erp.ilike.${like}`)
    .limit(12);
  const facturas = (facturasRaw ?? []).map((f: any) => ({
    id: f.id as string,
    numero: (f.numero_erp as string | null) ?? null,
    fecha: f.fecha as string,
    cliente: (f.clientes as any)?.nombre ?? null,
  }));

  const { data: articulos } = await supabase
    .from('articulos')
    .select('id, nombre, codigo_erp, familias_articulo:familia_id(nombre)')
    .or(`nombre.ilike.${like},codigo_erp.ilike.${like}`)
    .limit(12);
  const arts = (articulos ?? []).map((a: any) => ({
    id: a.id as string,
    nombre: a.nombre as string,
    codigo: (a.codigo_erp as string | null) ?? null,
    familia: (a.familias_articulo as any)?.nombre ?? null,
  }));

  return NextResponse.json({
    clientes: (clientes ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo_erp ?? null, commercial: null })),
    facturas,
    articulos: arts,
  });
}