import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function MarketingPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi',
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const empresa = await getEmpresaPorCodigo(cookieStore.get('sfb_empresa')?.value ?? 'SF');

  const [{ data: canales }, { data: inversionRaw }, { data: ventasRaw }] = await Promise.all([
    supabase.from('marketing_canales').select('id, nombre').order('nombre'),
    supabase.from('marketing_inversion').select('*'),
    supabase.from('ventas_semanales').select('*'),
  ]);

  const canalesBase = (canales ?? []) as { id: string; nombre: string }[];
  const inversion = (inversionRaw ?? []) as { fecha: string; canal_id: string | null; importe: number }[];
  const ventas = (ventasRaw ?? []) as { semana: string; ventas_totales: number }[];

  const tonCanales = new Map<string, number>();
  for (const i of inversion) tonCanales.set(i.canal_id ?? 'sin-canal', (tonCanales.get(i.canal_id ?? 'sin-canal') ?? 0) + Number(i.importe ?? 0));
  const canalNombre = new Map(canalesBase.map((c) => [c.id, c.nombre]));
  const totalInversion = inversion.reduce((a, b) => a + b.importe, 0);
  const totalVentas = ventas.reduce((a, b) => a + Number(b.ventas_totales ?? 0), 0);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque Marketing</p>
      <h1>Marketing Mix Modeling</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Solo canales offline (comerciales, call center, ferias). El histórico está en Excel
        del departamento financiero (más de 10 años) — pendiente de definir el proceso de
        import a Supabase.
      </p>

      <div className="card">
        <h2>Inversión registrada · {ANIO}</h2>
        <p style={{ color: 'var(--muted)' }}>
          {inversion.length === 0
            ? 'Sin datos de marketing cargados todavía. Los datos demo no incluyen inversión.'
            : `${inversion.length} registros de inversión.`}
        </p>
        {inversion.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canalesBase.map((c) => (
              <div key={c.id} className="kpi" style={{ flex: 1, minWidth: 140 }}>
                <span className="kpi-etiqueta">{c.nombre}</span>
                <strong className="kpi-valor">{tonCanales.get(c.id) !== undefined ? `${tonCanales.get(c.id)?.toLocaleString('es-ES')} €` : '—'}</strong>
              </div>
            ))}
          </div>
        )}
        {ventas.length > 0 && (
          <p style={{ color: 'var(--muted)', marginTop: 12 }}>
            Ventas semanales registradas: <strong>{totalVentas.toLocaleString('es-ES')} €</strong> en {ventas.length} semanas.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Proceso de import</h2>
        <p style={{ color: 'var(--muted)' }}>
          El histórico (más de 10 años) de inversión en marketing está en el Excel del departamento
          financiero. Dos tablas destino:
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Tabla</th>
                <th>Columnas</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>marketing_canales</code></td>
                <td>id, nombre</td>
                <td>Catálogo de canales (comerciales, call center, ferias…)</td>
              </tr>
              <tr>
                <td><code>marketing_inversion</code></td>
                <td>canal_id, fecha, importe, impresiones, clics</td>
                <td>Excel histórico de marketing</td>
              </tr>
              <tr>
                <td><code>ventas_semanales</code></td>
                <td>semana (fecha ISO), ventas_totales</td>
                <td>Ventas consolidadas por semana (para el MMM)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--muted)', marginTop: 12 }}>
          Cuando el cliente facilite el Excel, diseñamos el import (manual vía CSV o
          automatizado con n8n).
        </p>
      </div>
    </div>
  );
}