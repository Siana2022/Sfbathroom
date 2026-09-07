import { cookies } from 'next/headers';
import { getConcentracion } from '@/lib/datos/concentracion';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function ConcentracionPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getConcentracion(empresa, ANIO);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 7</p>
      <h1>Concentración y riesgo</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Concentración de clientes de {d.empresa.nombre} en {d.anio}: peso de los grandes clientes,
        índice de Herfindahl y curva de Pareto.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Facturación total" valor={eur(d.netaTotal)} nota={`${d.numClientes} clientes con venta`} />
        <Kpi etiqueta="% top 1" valor={d.top1 === null ? '—' : `${decimal(d.top1)} %`} nota="mayor cliente sobre el total" />
        <Kpi etiqueta="% top 3" valor={d.top3 === null ? '—' : `${decimal(d.top3)} %`} nota="tres mayores clientes" />
        <Kpi etiqueta="% top 10" valor={d.top10 === null ? '—' : `${decimal(d.top10)} %`} nota="diez mayores clientes" />
        <Kpi etiqueta="Índice de Herfindahl" valor={decimal(d.hhi)} nota="×10.000 (mayor = más concentrado)" />
      </ul>

      <div className="card">
        <h2>Curva de Pareto de clientes</h2>
        {d.pareto.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin datos.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th className="td-num">Facturación</th>
                <th className="td-num">% sobre total</th>
                <th className="td-num">% acumulado</th>
              </tr>
            </thead>
            <tbody>
              {d.pareto.map((c, i) => (
                <tr key={c.nombre}>
                  <td>{i + 1}</td>
                  <td>{c.nombre}</td>
                  <td className="td-num">{eur(c.neta)}</td>
                  <td className="td-num">{decimal(c.pct)} %</td>
                  <td className="td-num">{decimal(c.acumulado)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}