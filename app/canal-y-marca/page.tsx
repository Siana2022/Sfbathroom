import { cookies } from 'next/headers';
import { getCanalMarca } from '@/lib/datos/canalMarca';
import { decimal, eur } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function CanalMarcaPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getCanalMarca(empresa, ANIO);

  const cabeceraExcel = ['Segmento', 'Importe', '% facturación', 'Unidades', 'Precio medio', 'Clientes', 'Ref. activas', 'Cto. vs año anterior', 'Peso 12M rodante', 'Margen %', 'Margen €'];
  const filasExcel = d.porMarca.map((m) => [
      m.marca,
      m.importe.toFixed(2),
      m.pct.toFixed(2),
      m.unidades,
      m.precioMedio.toFixed(2),
      m.clientes,
      m.referencias,
      m.crecimientoPct === null ? '' : m.crecimientoPct.toFixed(2),
      m.peso12m === null ? '' : m.peso12m.toFixed(2),
      m.margenPct === null ? '' : m.margenPct.toFixed(2),
      m.margenAbs === null ? '' : m.margenAbs.toFixed(2),
    ]);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 6</p>
      <h1>Canal y marca</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Starbath Plus frente a marca blanca, y facturación por canal de {d.empresa.nombre} en {d.anio}.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="% facturación Starbath Plus" valor={d.pctStarbath === null ? '—' : `${decimal(d.pctStarbath)} %`} nota="indicador estratégico" />
        <Kpi
          etiqueta="Diferencial de margen SB − MB"
          valor={d.diferencialMargen.diffPct === null ? '—' : `${decimal(d.diferencialMargen.diffPct)} %`}
          nota={d.diferencialMargen.diffEuros === null ? '¿cuánto aporta un punto de traslado?' : `≈ ${eur(d.diferencialMargen.diffEuros)} por punto en % actual`}
        />
      </ul>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Métricas por segmento</h2>
          <DescargarExcel nombre={`canal-y-marca-${d.anio}`} columnas={cabeceraExcel} registros={filasExcel} etiqueta="Exportar a Excel" />
        </div>
        <table className="tabla">
          <thead>
            <tr>
              <th>Segmento</th>
              <th className="td-num">Importe</th>
              <th className="td-num">%</th>
              <th className="td-num">Unidades</th>
              <th className="td-num">Precio medio</th>
              <th className="td-num">Clientes</th>
              <th className="td-num">Ref. activas</th>
              <th className="td-num">Cto. vs año anterior</th>
              <th className="td-num">Peso 12M rodante</th>
              {!d.sinAccesoMargen && <th className="td-num">Margen</th>}
            </tr>
          </thead>
          <tbody>
            {d.porMarca.map((m) => (
              <tr key={m.marca}>
                <td>{m.marca}</td>
                <td className="td-num">{eur(m.importe)}</td>
                <td className="td-num">{decimal(m.pct)} %</td>
                <td className="td-num">{m.unidades}</td>
                <td className="td-num">{eur(m.precioMedio)}</td>
                <td className="td-num">{m.clientes}</td>
                <td className="td-num">{m.referencias}</td>
                <td className="td-num">{m.crecimientoPct === null ? '—' : `${decimal(m.crecimientoPct)} %`}</td>
                <td className="td-num">{m.peso12m === null ? '—' : `${decimal(m.peso12m)} %`}</td>
                {!d.sinAccesoMargen && <td className="td-num">{m.margenPct === null ? '—' : `${decimal(m.margenPct)} %`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Evolución del peso Starbath Plus — últimos 12 meses</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="td-num">Starbath Plus</th>
              <th className="td-num">Marca blanca</th>
              <th className="td-num">% SB</th>
            </tr>
          </thead>
          <tbody>
            {d.pctStarbathMensual.map((m) => {
              const tot = m.sb + m.mb;
              return (
                <tr key={m.mes}>
                  <td>{m.mes}</td>
                  <td className="td-num">{eur(m.sb)}</td>
                  <td className="td-num">{eur(m.mb)}</td>
                  <td className="td-num">{tot > 0 ? decimal((m.sb / tot) * 100) : '—'} %</td>
                </tr>
              );
            })}
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

      <div className="card">
        <h2>Marca blanca por cliente-fabricante</h2>
        <p style={{ color: 'var(--muted)' }}>Dependencia dentro del canal más sustituible.</p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="td-num">Importe</th>
              <th className="td-num">% sobre total</th>
            </tr>
          </thead>
          <tbody>
            {d.marcaBlancaPorCliente.map((c) => (
              <tr key={c.cliente}>
                <td>{c.cliente}</td>
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