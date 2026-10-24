import { cookies } from 'next/headers';
import { getRentabilidadClientes } from '@/lib/datos/rentabilidadClientes';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import Aviso from '@/components/Aviso';
import { ANIO_ACTUAL } from '@/lib/ejercicio';

const ANIO = ANIO_ACTUAL;

export default async function RentabilidadClientesPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa, { fuente: 'facturas', anio: ANIO });
  const d = await getRentabilidadClientes(empresa, ANIO, filtros);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Rentabilidad</p>
      <h1>Rentabilidad por cliente</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 860 }}>
        Facturación neta por cliente frente a coste de material (coste completo de llegada por lote) y coste de
        transporte interior repartido por importe facturado. Margen bruto = facturación neta − coste material −
        transporte interior.
      </p>

      <Aviso tipo="info">
        El reparto del transporte interior se hace <strong>proporcional al importe facturado</strong> por cliente en
        cada ejercicio, porque las facturas de las agencias no traen referencia directa al cliente en el esquema
        actual.
      </Aviso>

      <Filtros opciones={opciones} />

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación neta ${d.anio}`} valor={eur(d.totales.facturacionNeta)} />
        <Kpi etiqueta="Unidades facturadas" valor={numero(d.totales.unidades)} />
        <Kpi etiqueta="Coste material" valor={eur(d.totales.costeMaterial)} />
        <Kpi etiqueta="Coste transporte interior (repartido)" valor={eur(d.totales.costeTransporteInterior)} />
        <Kpi etiqueta="Margen bruto" valor={eur(d.totales.margenBruto)} />
        <Kpi
          etiqueta="Margen bruto %"
          valor={d.totales.margenBrutoPct === null ? '—' : `${decimal(d.totales.margenBrutoPct)} %`}
        />
      </ul>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2>Rentabilidad por cliente · {d.anio}</h2>
          <DescargarExcel
            nombre={`rentabilidad-clientes-${d.anio}`}
            columnas={['Cliente', 'Facturación neta', 'Unidades', 'Coste material', 'Transporte interior (repartido)', 'Margen bruto', 'Margen bruto %']}
            registros={d.filas.map((f) => [
              f.cliente,
              f.facturacionNeta,
              f.unidades,
              f.costeMaterial,
              f.costeTransporteInterior,
              f.margenBruto,
              f.margenBrutoPct === null ? '' : f.margenBrutoPct,
            ])}
          />
        </div>
        {d.filas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin facturación para los filtros seleccionados.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="td-num">Facturación neta</th>
                  <th className="td-num">Unidades</th>
                  <th className="td-num">Coste material</th>
                  <th className="td-num">Transporte interior (repartido)</th>
                  <th className="td-num">Margen bruto</th>
                  <th className="td-num">Margen bruto %</th>
                </tr>
              </thead>
              <tbody>
                {d.filas.map((f) => (
                  <tr key={f.cliente_id}>
                    <td>{f.cliente}</td>
                    <td className="td-num">{eur(f.facturacionNeta)}</td>
                    <td className="td-num">{numero(f.unidades)}</td>
                    <td className="td-num">{eur(f.costeMaterial)}</td>
                    <td className="td-num">{eur(f.costeTransporteInterior)}</td>
                    <td className={`td-num ${f.margenBruto < 0 ? 'td-pos' : ''}`}>{eur(f.margenBruto)}</td>
                    <td className={`td-num ${f.margenBrutoPct !== null && f.margenBrutoPct < 0 ? 'td-pos' : ''}`}>
                      {f.margenBrutoPct === null ? '—' : `${decimal(f.margenBrutoPct)} %`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="td-num"><strong>{eur(d.totales.facturacionNeta)}</strong></td>
                  <td className="td-num"><strong>{numero(d.totales.unidades)}</strong></td>
                  <td className="td-num"><strong>{eur(d.totales.costeMaterial)}</strong></td>
                  <td className="td-num"><strong>{eur(d.totales.costeTransporteInterior)}</strong></td>
                  <td className="td-num"><strong>{eur(d.totales.margenBruto)}</strong></td>
                  <td className="td-num"><strong>{d.totales.margenBrutoPct === null ? '—' : `${decimal(d.totales.margenBrutoPct)} %`}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
