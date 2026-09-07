import { cookies } from 'next/headers';
import { getCanalMarca } from '@/lib/datos/canalMarca';
import { decimal, eur } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function CanalMarcaPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getCanalMarca(empresa, ANIO);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 6</p>
      <h1>Canal y marca</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Starbath Plus frente a marca blanca, y facturación por canal de {d.empresa.nombre} en {d.anio}.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="% facturación Starbath Plus" valor={d.pctStarbath === null ? '—' : `${decimal(d.pctStarbath)} %`} nota="indicador estratégico" />
      </ul>

      <div className="card">
        <h2>Facturación por marca</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Marca</th>
              <th className="td-num">Importe</th>
              <th className="td-num">%</th>
            </tr>
          </thead>
          <tbody>
            {d.porMarca.map((m) => (
              <tr key={m.marca}>
                <td>{m.marca}</td>
                <td className="td-num">{eur(m.importe)}</td>
                <td className="td-num">{decimal(m.pct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Facturación por canal</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Canal</th>
              <th className="td-num">Importe</th>
              <th className="td-num">%</th>
            </tr>
          </thead>
          <tbody>
            {d.porCanal.map((c) => (
              <tr key={c.canal}>
                <td>{c.canal}</td>
                <td className="td-num">{eur(c.importe)}</td>
                <td className="td-num">{decimal(c.pct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}