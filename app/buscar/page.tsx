import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function buscar(q: string) {
  if (!q || q.length < 2) return null;
  const cookieStore = cookies();
  const { createServerClient } = await import('@supabase/ssr');
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const like = `%${q}%`;
  const [clientes, facturas, articulos] = await Promise.all([
    supabase.from('clientes').select('id, nombre, codigo_erp').or(`nombre.ilike.${like},codigo_erp.ilike.${like},cif.ilike.${like}`).limit(20),
    supabase.from('facturas').select('id, numero_erp, fecha, cliente_id, clientes:cliente_id(nombre)').or(`numero_erp.ilike.${like}`).limit(20),
    supabase.from('articulos').select('id, nombre, codigo_erp, familias_articulo:familia_id(nombre)').or(`nombre.ilike.${like},codigo_erp.ilike.${like}`).limit(20),
  ]);

  return {
    clientes: (clientes.data ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo_erp ?? null })),
    facturas: (facturas.data ?? []).map((f: any) => ({ id: f.id, numero: f.numero_erp ?? null, fecha: f.fecha, cliente: (f.clientes as any)?.nombre ?? null })),
    articulos: (articulos.data ?? []).map((a: any) => ({ id: a.id, nombre: a.nombre, codigo: a.codigo_erp ?? null, familia: (a.familias_articulo as any)?.nombre ?? null })),
  };
}

export default async function BuscarPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim() ?? '';
  const resultados = await buscar(q);

  return (
    <div>
      <p className="breadcrumb">Búsqueda global</p>
      <h1>Resultados para &ldquo;{q}&rdquo;</h1>
      {!resultados || (resultados.clientes.length === 0 && resultados.facturas.length === 0 && resultados.articulos.length === 0) ? (
        <p style={{ color: 'var(--muted)' }}>{q.length < 2 ? 'Escribe al menos 2 caracteres para buscar.' : 'Sin resultados para esta búsqueda.'}</p>
      ) : (
        <div className="grid-cards">
          {resultados.clientes.length > 0 && (
            <div className="card-tarjeta">
              <h3>Clientes ({resultados.clientes.length})</h3>
              <ul className="tablas">
                {resultados.clientes.map((c) => (
                  <li key={c.id}><Link href={`/clientes/${c.id}`} className="enlace">{c.nombre}</Link> {c.codigo ? <span className="td-num">({c.codigo})</span> : null}</li>
                ))}
              </ul>
            </div>
          )}
          {resultados.facturas.length > 0 && (
            <div className="card-tarjeta">
              <h3>Facturas ({resultados.facturas.length})</h3>
              <ul className="tablas">
                {resultados.facturas.map((f) => (
                  <li key={f.id}>{f.fecha} · {f.numero ?? '—'} {f.cliente ? <span className="td-num">({f.cliente})</span> : null}</li>
                ))}
              </ul>
            </div>
          )}
          {resultados.articulos.length > 0 && (
            <div className="card-tarjeta">
              <h3>Artículos ({resultados.articulos.length})</h3>
              <ul className="tablas">
                {resultados.articulos.map((a) => (
                  <li key={a.id}>{a.nombre} {a.codigo ? <span className="td-num">({a.codigo})</span> : null} {a.familia ? <span style={{ color: 'var(--muted)' }}>· {a.familia}</span> : null}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}