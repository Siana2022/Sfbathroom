import { cookies } from 'next/headers';
import { getConcentracion, UMBRAL_CLIENTE_DE_FAMILIA, UMBRAL_FAMILIA_RELEVANTE } from '@/lib/datos/concentracion';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function ConcentracionPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getConcentracion(empresa, ANIO, filtros);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 7</p>
      <h1>Concentración y riesgo</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Concentración de clientes de {d.empresa.nombre} en {d.anio}: peso de los grandes clientes,
        índice de Herfindahl y curva de Pareto.
      </p>

      <Filtros opciones={opciones} />

      <ul className="grid-kpis">
        <Kpi etiqueta="Facturación total" valor={eur(d.netaTotal)} nota={`${d.numClientes} clientes con venta`} />
        <Kpi etiqueta="% top 1" valor={d.top1 === null ? '—' : `${decimal(d.top1)} %`} nota="mayor cliente sobre el total" />
        <Kpi etiqueta="% top 3" valor={d.top3 === null ? '—' : `${decimal(d.top3)} %`} nota="tres mayores clientes" />
        <Kpi etiqueta="% top 10" valor={d.top10 === null ? '—' : `${decimal(d.top10)} %`} nota="diez mayores clientes" />
        <Kpi etiqueta="Índice de Herfindahl" valor={decimal(d.hhi)} nota="×10.000 (mayor = más concentrado)" />
      </ul>

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

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Riesgo de proveedor</h2>
          <DescargarExcel
            nombre={`concentracion-riesgo-proveedor-${d.anio}`}
            columnas={['Proveedor', 'País', 'Plazo pactado', 'Plazo real', 'Volumen', '% compra', 'Artículos', 'Alternativas']}
            registros={d.riesgoProveedor.map((p) => [p.proveedor, p.pais, p.plazo, p.plazoReal ?? '', p.volumen, p.pctVolumen, p.articulos, p.alternativas])}
          />
        </div>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Origen, plazo de entrega (pactado y real observado en compras) y dependencia por
          proveedor. La alerta dispara por encima de 75 días pactados; un solo proveedor
          activo marca ausencia de alternativa.
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>País</th>
              <th className="td-num">Plazo pactado</th>
              <th className="td-num">Plazo real</th>
              <th className="td-num">Volumen comprado</th>
              <th className="td-num">% compra</th>
              <th className="td-num">Artículos</th>
              <th className="td-num">Alternativas</th>
              <th>Riesgo</th>
            </tr>
          </thead>
          <tbody>
            {d.riesgoProveedor.map((p) => (
              <tr key={p.proveedor}>
                <td>{p.proveedor}</td>
                <td>{p.pais}</td>
                <td className={`td-num ${p.plazoAlto ? 'td-pos' : ''}`}>{numero(p.plazo)} días</td>
                <td className="td-num">{p.plazoReal === null ? '—' : `${numero(p.plazoReal)} días`}</td>
                <td className="td-num">{eur(p.volumen)}</td>
                <td className="td-num">{decimal(p.pctVolumen)} %</td>
                <td className="td-num">{numero(p.articulos)}</td>
                <td className="td-num">{numero(p.alternativas)}</td>
                <td>
                  <span className={`td-num ${p.chino || p.plazoAlto || p.sinAlternativa ? 'td-pos' : ''}`}>
                    {[p.chino && 'origen China', p.plazoAlto && 'plazo alto', p.sinAlternativa && 'sin alternativa'].filter(Boolean).join(' · ') || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}