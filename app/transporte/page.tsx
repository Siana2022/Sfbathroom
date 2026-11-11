import { cookies } from 'next/headers';
import {
  getCosteTransporte,
  getCosteTransportePorProveedor,
  getTransporteFacturadoPorCliente,
  getRentabilidadTransporteCliente,
  type TransporteClienteMes,
  type TransporteProveedorMes,
} from '@/lib/datos/transporte';
import { eur, decimal } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import { ANIO_ACTUAL } from '@/lib/ejercicio';

const ANIO = ANIO_ACTUAL;

const NOMBRE_MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function TablaTransporteCliente({ titulo, anio, filas, total }: { titulo: string; anio: number; filas: TransporteClienteMes[]; total: number }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <DescargarExcel
          nombre={`transporte-${titulo.toLowerCase().replace(/\s+/g, '-')}-${anio}`}
          columnas={['Cliente', ...NOMBRE_MES.slice(1), 'Total']}
          registros={filas.map((f) => [f.cliente, ...f.meses, f.total])}
        />
      </div>
      {filas.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Sin importes facturados en {anio}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                {NOMBRE_MES.slice(1).map((m) => (
                  <th key={m} className="td-num">{m}</th>
                ))}
                <th className="td-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.cliente}>
                  <td>{f.cliente}</td>
                  {f.meses.map((v, i) => (
                    <td key={i} className="td-num">{v === 0 ? '' : eur(v)}</td>
                  ))}
                  <td className="td-num"><strong>{eur(f.total)}</strong></td>
                </tr>
              ))}
              <tr>
                <td><strong>Total</strong></td>
                {NOMBRE_MES.slice(1).map((_, i) => (
                  <td key={i} className="td-num">
                    <strong>{eur(filas.reduce((s, f) => s + f.meses[i], 0))}</strong>
                  </td>
                ))}
                <td className="td-num"><strong>{eur(total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TablaTransporteProveedor({ titulo, anio, filas, total }: { titulo: string; anio: number; filas: TransporteProveedorMes[]; total: number }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <DescargarExcel
          nombre={`coste-${titulo.toLowerCase().replace(/\s+/g, '-')}-${anio}`}
          columnas={['Proveedor', ...NOMBRE_MES.slice(1), 'Total']}
          registros={filas.map((f) => [f.proveedor, ...f.meses, f.total])}
        />
      </div>
      {filas.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Sin coste en {anio}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                {NOMBRE_MES.slice(1).map((m) => (
                  <th key={m} className="td-num">{m}</th>
                ))}
                <th className="td-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.proveedor}>
                  <td>{f.proveedor}</td>
                  {f.meses.map((v, i) => (
                    <td key={i} className="td-num">{v === 0 ? '' : eur(v)}</td>
                  ))}
                  <td className="td-num"><strong>{eur(f.total)}</strong></td>
                </tr>
              ))}
              <tr>
                <td><strong>Total</strong></td>
                {NOMBRE_MES.slice(1).map((_, i) => (
                  <td key={i} className="td-num">
                    <strong>{eur(filas.reduce((s, f) => s + f.meses[i], 0))}</strong>
                  </td>
                ))}
                <td className="td-num"><strong>{eur(total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function TransportePage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';

  const [trans, transCli, costeProv, rent] = await Promise.all([
    getCosteTransporte(empresa, ANIO),
    getTransporteFacturadoPorCliente(empresa, ANIO),
    getCosteTransportePorProveedor(empresa, ANIO),
    getRentabilidadTransporteCliente(empresa, ANIO),
  ]);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 5</p>
      <h1>Transporte</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Coste de transporte real (flete, aduana y transporte interior) extraído de las facturas de
        compra de A3ERP, y transporte facturado a cliente a partir de las líneas de transporte.
      </p>

      <div className="card">
        <h2>Rentabilidad de transporte terrestre por cliente · {ANIO}</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 900 }}>
          Por cada cliente, lo que se le <strong>factura</strong> de transporte terrestre (líneas ZZ TRANSP
          interiores) frente a lo que <strong>cuesta</strong> (coste de esas mismas líneas). Margen = facturado − coste.
          Si no se cobra transporte (precio 0) pero hay coste, el margen sale negativo.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
          <DescargarExcel
            nombre={`rentabilidad-transporte-${ANIO}`}
            columnas={['Cliente', 'Factura transporte', 'Facturado', 'Coste', 'Margen', 'Margen %']}
            registros={rent.filas.map((f) => [f.cliente, f.facturaTransporte ? 'Sí' : 'No', f.facturado, f.coste, f.margen, f.margenPct ?? ''])}
          />
        </div>
        {rent.filas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin líneas de transporte terrestre en {ANIO}.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Factura transporte</th>
                  <th className="td-num">Facturado</th>
                  <th className="td-num">Coste</th>
                  <th className="td-num">Margen</th>
                  <th className="td-num">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {rent.filas.map((f) => (
                  <tr key={f.cliente}>
                    <td>{f.cliente}</td>
                    <td>{f.facturaTransporte ? 'Sí' : 'No'}</td>
                    <td className="td-num">{eur(f.facturado)}</td>
                    <td className="td-num">{eur(f.coste)}</td>
                    <td className={`td-num ${f.margen >= 0 ? 'td-pos' : ''}`} style={f.margen < 0 ? { color: '#c0392b' } : undefined}>
                      {f.margen > 0 ? '+' : ''}{eur(f.margen)}
                    </td>
                    <td className="td-num" style={f.margenPct != null && f.margenPct < 0 ? { color: '#c0392b' } : undefined}>
                      {f.margenPct === null ? '—' : `${decimal(f.margenPct)} %`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total</strong></td>
                  <td></td>
                  <td className="td-num"><strong>{eur(rent.totales.facturado)}</strong></td>
                  <td className="td-num"><strong>{eur(rent.totales.coste)}</strong></td>
                  <td className="td-num"><strong style={rent.totales.margen < 0 ? { color: '#c0392b' } : undefined}>{eur(rent.totales.margen)}</strong></td>
                  <td className="td-num"><strong>{rent.totales.margenPct === null ? '—' : `${decimal(rent.totales.margenPct)} %`}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <TablaTransporteCliente
          titulo="Facturado de transporte terrestre por mes"
          anio={ANIO}
          filas={rent.filas.filter((f) => Math.abs(f.facturado) > 0.005).map((f) => ({ cliente: f.cliente, meses: f.facturadoMeses, total: f.facturado }))}
          total={rent.totales.facturado}
        />
        <TablaTransporteCliente
          titulo="Coste de transporte terrestre por mes"
          anio={ANIO}
          filas={rent.filas.filter((f) => Math.abs(f.coste) > 0.005).map((f) => ({ cliente: f.cliente, meses: f.costeMeses, total: f.coste }))}
          total={rent.totales.coste}
        />
      </div>

      <div className="card">
        <h2>Coste de transporte anual · {ANIO}</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Portes, aduana, seguro y transporte interior reales extraídos de las facturas de compra de A3ERP.
        </p>
        <ul className="grid-kpis">
          <Kpi etiqueta="Coste de transporte total" valor={trans.total === 0 ? '—' : eur(trans.total)} nota="fletes + aduanas + interior" />
          <Kpi etiqueta="Flete" valor={eur(trans.flete)} nota="transporte internacional" />
          <Kpi etiqueta="Aduana" valor={eur(trans.aduana)} nota="AEAT DUA" />
          <Kpi etiqueta="Transporte interior" valor={eur(trans.transporteInterior)} nota="distribución terrestre" />
        </ul>
        <p style={{ color: 'var(--muted)', maxWidth: 900, marginTop: 16 }}>
          Desglose mensual del coste por proveedor (facturas de compra). No se puede atribuir a cliente: esas
          facturas no llevan cliente en A3ERP.
        </p>
        <TablaTransporteProveedor titulo="Coste flete por proveedor" anio={costeProv.anio} filas={costeProv.flete.filas} total={costeProv.flete.total} />
        <TablaTransporteProveedor titulo="Coste aduana por proveedor" anio={costeProv.anio} filas={costeProv.aduana.filas} total={costeProv.aduana.total} />
        <TablaTransporteProveedor titulo="Coste transporte interior por proveedor" anio={costeProv.anio} filas={costeProv.interior.filas} total={costeProv.interior.total} />
      </div>

      <div className="card">
        <h2>Transporte facturado por cliente y mes · {transCli.anio}</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 900 }}>
          Importe de las líneas de factura de transporte (artículos ZZ TRANSP / ZZADTRANSPORTE), agrupado por
          cliente y mes. Interior, flete y aduana se separan según el nombre del artículo facturado.
        </p>
        <TablaTransporteCliente titulo="Transporte interior" anio={transCli.anio} filas={transCli.interior.filas} total={transCli.interior.total} />
        <TablaTransporteCliente titulo="Flete" anio={transCli.anio} filas={transCli.flete.filas} total={transCli.flete.total} />
        <TablaTransporteCliente titulo="Aduana" anio={transCli.anio} filas={transCli.aduana.filas} total={transCli.aduana.total} />
      </div>
    </div>
  );
}
