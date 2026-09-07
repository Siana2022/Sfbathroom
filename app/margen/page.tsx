import { cookies } from 'next/headers';
import { getMargen } from '@/lib/datos/margen';
import { decimal, eur, eur2 } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function MargenPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getMargen(empresa, ANIO);

  if (d.sinAcceso) {
    return (
      <div>
        <p className="breadcrumb">Cuadro de mando · Bloque 3</p>
        <h1>Margen y rentabilidad</h1>
        <div className="card">
          <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
            El bloque de margen y costes está restringido a dirección y al responsable financiero.
            Consulta al administrador si necesitas acceso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 3</p>
      <h1>Margen y rentabilidad</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Margen de {d.empresa.nombre} en {d.anio}, calculado sobre el coste unitario de cada línea y
        el coste completo de llegada por lote (flete, aduana, seguro, transporte y tipo de cambio).
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Margen bruto" valor={eur(d.margen)} nota={`${decimal(d.margenPct)} % sobre venta`} />
        <Kpi etiqueta="Importe vendido" valor={eur(d.importeVendido)} nota={`coste de venta ${eur(d.costeVenta)}`} />
        <Kpi etiqueta="Margen medio" valor={`${decimal(d.margenPct)} %`} nota="venta − coste de venta" />
      </ul>

      <div className="card">
        <h2>Margen por familia</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Familia</th>
              <th className="td-num">Importe vendido</th>
              <th className="td-num">Coste</th>
              <th className="td-num">Margen</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {d.porFamilia.map((f) => (
              <tr key={f.familia}>
                <td>{f.familia}</td>
                <td className="td-num">{eur(f.importe)}</td>
                <td className="td-num">{eur(f.coste)}</td>
                <td className="td-num">{eur(f.margen)}</td>
                <td className={`td-num ${f.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(f.margenPct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Top 10 artículos por margen</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="td-num">Unidades</th>
              <th className="td-num">Importe</th>
              <th className="td-num">Margen</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {d.porArticulo.map((a) => (
              <tr key={a.articulo}>
                <td>{a.articulo}</td>
                <td className="td-num">{Math.round(a.unidades)}</td>
                <td className="td-num">{eur(a.importe)}</td>
                <td className="td-num">{eur(a.margen)}</td>
                <td className={`td-num ${a.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(a.margenPct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Coste completo de llegada · últimos lotes</h2>
        {d.ultimosLotes.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin lotes de compra cargados.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Artículo</th>
                <th className="td-num">Fecha</th>
                <th className="td-num">Coste compra</th>
                <th className="td-num">+ reparto</th>
                <th className="td-num">Coste completo llegada</th>
              </tr>
            </thead>
            <tbody>
              {d.ultimosLotes.map((l) => (
                <tr key={l.lote + l.articulo}>
                  <td>{l.lote}</td>
                  <td>{l.articulo}</td>
                  <td className="td-num">{l.fecha}</td>
                  <td className="td-num">{eur2(l.costeCompra)}</td>
                  <td className="td-num">{eur2(l.costeRepartido)}</td>
                  <td className="td-num">{eur2(l.costeCompleto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}