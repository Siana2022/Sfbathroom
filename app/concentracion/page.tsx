import { cookies } from 'next/headers';
import { getConcentracion, UMBRAL_CLIENTE_DE_FAMILIA, UMBRAL_FAMILIA_RELEVANTE } from '@/lib/datos/concentracion';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero } from '@/lib/formato';
import KpisConcentracion from '@/components/KpisConcentracion';
import Tarta from '@/components/Tarta';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

export default async function ConcentracionPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getConcentracion(empresa, ANIO, filtros);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 8</p>
      <h1>Concentración y riesgo</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Concentración de clientes de {d.empresa.nombre} en {d.anio}: peso de los grandes clientes,
        índice de Herfindahl y curva de Pareto.
      </p>

      <Filtros opciones={opciones} />

      <KpisConcentracion
        netaTotal={d.netaTotal}
        numClientes={d.numClientes}
        top1={d.top1}
        top3={d.top3}
        top10={d.top10}
        hhi={d.hhi}
        pareto={d.pareto}
      />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Concentración de producto y geografía</h2>
          <DescargarExcel
            nombre={`concentracion-por-pais-${d.anio}`}
            columnas={['Mercado', 'Facturación', '% sobre total']}
            registros={d.porPais.map((p) => [p.pais, p.neta, p.pct])}
          />
        </div>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Peso de las 3 familias principales: {decimal(d.pct3Familias)} % · las 20 referencias top:
          {decimal(d.pctTop20Refs)} % · referencias que concentran el 80 % de la facturación:{' '}
          {numero(d.refs80)}.
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Mercado</th>
              <th className="td-num">Facturación</th>
              <th className="td-num">% sobre total</th>
            </tr>
          </thead>
          <tbody>
            {d.porPais.map((p) => (
              <tr key={p.pais}>
                <td>{p.pais}</td>
                <td className="td-num">{eur(p.neta)}</td>
                <td className="td-num">{decimal(p.pct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="split-columnas">
          <Tarta datos={d.porPais.map((p) => ({ etiqueta: p.pais, valor: p.neta }))} />
          <Tarta datos={d.familias.map((f) => ({ etiqueta: f.familia, valor: f.neta }))} />
        </div>
      </div>

      <div className="card">
        <h2>Matriz cliente × familia de riesgo</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Combinaciones donde una familia relevante (≥ {Math.round(UMBRAL_FAMILIA_RELEVANTE * 100)} % de la
          facturación) depende de un solo cliente (≥ {Math.round(UMBRAL_CLIENTE_DE_FAMILIA * 100)} % de la
          familia). Al perder ese cliente se pierde a la vez la viabilidad de la familia y su stock.
        </p>
        {d.riesgo.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Ninguna familia relevante depende de un solo cliente con los umbrales actuales.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Familia</th>
                <th>Cliente dominante</th>
                <th className="td-num">Neta de la familia</th>
                <th className="td-num">% que absorbe el cliente</th>
              </tr>
            </thead>
            <tbody>
              {d.riesgo.map((r) => (
                <tr key={r.familia + r.cliente}>
                  <td>{r.familia}</td>
                  <td>{r.cliente}</td>
                  <td className="td-num">{eur(r.netaFamilia)}</td>
                  <td className="td-num">{decimal(r.pctCliente)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}