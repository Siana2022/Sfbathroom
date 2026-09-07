import { cookies } from 'next/headers';
import { getFacturacion, getVariacion } from '@/lib/datos/facturacion';
import { decimal, eur, numero, pct } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import GraficoBarras, { type Barra } from '@/components/GraficoBarras';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

const NOMBRE_MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default async function FacturacionPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getFacturacion(empresa, ANIO);
  const previo = d.anioPrevio;
  const delta = d.netaPrevioTotal > 0 ? pct(((d.neta - d.netaPrevioTotal) / d.netaPrevioTotal) * 100) : '—';

  const v = await getVariacion(empresa, ANIO);

  const barras: Barra[] = d.series.map((s) => ({
    etiqueta: NOMBRE_MES[s.mes],
    valor: s.neta,
    valor2: s.netaPrevio,
    titulo: `${NOMBRE_MES[s.mes]} ${d.anio}`,
  }));

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 1</p>
      <h1>Facturación</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Facturación neta de {d.empresa.nombre} ({d.empresa.codigo}). Neta = facturas + notas de
        cargo − abonos, imputando cada documento en su fecha.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación neta ${d.anio}`} valor={eur(d.neta)} nota={`vs ${previo}: ${delta}`} />
        <Kpi etiqueta="Desviación presupuesto" valor={d.cumplimiento === null ? '—' : `${decimal(d.cumplimiento)} %`} nota={d.cumplimiento === null ? 'sin presupuesto' : `presupuesto ${eur(d.presupuesto)}`} />
        <Kpi etiqueta="Unidades facturadas" valor={numero(d.unidades)} nota={`${d.nFacturas} facturas emitidas`} />
        <Kpi etiqueta="Ticket medio por factura" valor={eur(d.ticketMedio)} nota="sobre facturas netas" />
        <Kpi etiqueta="Precio medio de venta" valor={eur(d.precioMedio)} nota="por unidad facturada" />
      </ul>

      <div className="card">
        <h2>Evolución mensual · {d.anio} frente a {previo}</h2>
        <GraficoBarras series={barras} formato={eur} leyenda={{ a: String(d.anio), b: String(previo) }} />
      </div>

      <div className="card">
        <h2>Cumplimiento de presupuesto por mes</h2>
        {d.presupuesto === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No hay presupuesto cargado para {d.anio}.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="td-num">Facturación neta</th>
                <th className="td-num">Presupuesto</th>
                <th className="td-num">Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              {d.series.map((s) => (
                <tr key={s.mes}>
                  <td>{NOMBRE_MES[s.mes]} {d.anio}</td>
                  <td className="td-num">{eur(s.neta)}</td>
                  <td className="td-num">{eur(s.presupuesto ?? 0)}</td>
                  <td className={`td-num ${s.presupuesto ? 'td-pos' : ''}`}>
                    {s.presupuesto ? `${decimal((s.neta / s.presupuesto) * 100)} %` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {d.abonosYNotas > 0 ? (
        <p className="nota" style={{ color: 'var(--muted)' }}>
          El ejercicio tiene {d.abonosYNotas} documentos de abono o nota de cargo; sus importes se
          restan o suman en la neta del mes en que se emiten.
        </p>
      ) : null}

      <div className="card">
        <h2>¿De dónde viene la variación {d.anio} frente a {previo}?</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Descomposición de la diferencia a nivel de línea de factura. La variación total es
          {eur(v.delta)}{' '}
          {v.delta > 0 ? 'más' : 'menos'} que en {previo}.
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Efecto</th>
              <th className="td-num">Importe</th>
              <th className="td-num">% de la variación</th>
              <th>Qué explica</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Volumen</td>
              <td className="td-num">{eur(v.volumen)}</td>
              <td className="td-num">{v.delta === 0 ? '—' : `${decimal((v.volumen / v.delta) * 100)} %`}</td>
              <td>Se vendieron más o menos piezas, al precio medio de {previo}.</td>
            </tr>
            <tr>
              <td>Precio</td>
              <td className="td-num">{eur(v.precio)}</td>
              <td className="td-num">{v.delta === 0 ? '—' : `${decimal((v.precio / v.delta) * 100)} %`}</td>
              <td>Cambio de lo que cobramos por cada unidad, manteniendo las cantidades actuales.</td>
            </tr>
            <tr>
              <td>Mix de producto</td>
              <td className="td-num">{eur(v.mix)}</td>
              <td className="td-num">{v.delta === 0 ? '—' : `${decimal((v.mix / v.delta) * 100)} %`}</td>
              <td>Cambio en la composición de lo vendido (más referencias caras o baratas).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Efecto por tipo de cliente</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Grupo</th>
              <th className="td-num">Aportación a la variación</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Clientes que facturaron solo en {previo}</td>
              <td className="td-num">{eur(v.efectoClientes.perdidos)}</td>
            </tr>
            <tr>
              <td>Clientes que facturaron solo en {d.anio}</td>
              <td className="td-num">{eur(v.efectoClientes.nuevos)}</td>
            </tr>
            <tr>
              <td>Clientes presentes en ambos ejercicios</td>
              <td className="td-num">{eur(v.efectoClientes.existentes)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}