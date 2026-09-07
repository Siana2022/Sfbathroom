import { cookies } from 'next/headers';
import { getFacturacion, getVariacion } from '@/lib/datos/facturacion';
import { getVistasTemporales } from '@/lib/datos/vistas';
import { getCosteTransporte } from '@/lib/datos/transporte';
import { getDesvioPresupuesto } from '@/lib/datos/desvioPresupuesto';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero, pct } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import GraficoBarras, { type Barra } from '@/components/GraficoBarras';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

const NOMBRE_MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function TablaDesvio({ filas }: { filas: { nombre: string; presupuesto: number; neta: number; desvio: number; desvioPct: number | null }[] }) {
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Dimensión</th>
          <th className="td-num">Presupuesto</th>
          <th className="td-num">Facturación</th>
          <th className="td-num">Desvío</th>
          <th className="td-num">%</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.nombre}>
            <td>{f.nombre}</td>
            <td className="td-num">{eur(f.presupuesto)}</td>
            <td className="td-num">{eur(f.neta)}</td>
            <td className={`td-num ${f.desvio < 0 ? 'td-pos' : ''}`}>{f.desvio > 0 ? '+' : ''}{eur(f.desvio)}</td>
            <td className={`td-num ${f.desvioPct != null && f.desvioPct < 0 ? 'td-pos' : ''}`}>
              {f.desvioPct === null ? '—' : `${f.desvioPct > 0 ? '+' : ''}${decimal(f.desvioPct)} %`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function FacturacionPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getFacturacion(empresa, ANIO, filtros);
  const t = await getVistasTemporales(empresa, ANIO, filtros);
  const previo = d.anioPrevio;
  const delta = d.netaPrevioTotal > 0 ? pct(((d.neta - d.netaPrevioTotal) / d.netaPrevioTotal) * 100) : '—';

  const v = await getVariacion(empresa, ANIO, filtros);
  const trans = await getCosteTransporte(empresa, ANIO);
  const desvio = await getDesvioPresupuesto(empresa, ANIO, filtros);

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

      <Filtros opciones={opciones} />

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación neta ${d.anio}`} valor={eur(d.neta)} nota={`vs ${previo}: ${delta}`} />
        <Kpi etiqueta="Desviación presupuesto" valor={d.cumplimiento === null ? '—' : `${decimal(d.cumplimiento)} %`} nota={d.cumplimiento === null ? 'sin presupuesto' : `presupuesto ${eur(d.presupuesto)}`} />
        <Kpi etiqueta="Unidades facturadas" valor={numero(d.unidades)} nota={`${d.nFacturas} facturas emitidas`} />
        <Kpi etiqueta="Ticket medio por factura" valor={eur(d.ticketMedio)} nota="sobre facturas netas" />
        <Kpi etiqueta="Precio medio de venta" valor={eur(d.precioMedio)} nota="por unidad facturada" />
      </ul>

      <div className="card">
        <h2>Coste de transporte anual · {d.anio}</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Métrica propia Q1: portes, aduana, seguro y transporte interior de las compras. Se
          informa aparte; no se imputa como venta al cliente.
        </p>
        <ul className="grid-kpis">
          <Kpi etiqueta="Coste de transporte total" valor={trans.total === 0 ? '—' : eur(trans.total)} nota={`${trans.compras} compras en el ejercicio`} />
          <Kpi etiqueta="Flete" valor={eur(trans.flete)} nota="marítimo/aéreo" />
          <Kpi etiqueta="Aduana" valor={eur(trans.aduana)} nota="aranceles" />
          <Kpi etiqueta="Seguro + transporte interior" valor={eur(trans.seguro + trans.transporteInterior)} nota={`seguro ${eur(trans.seguro)} · interior ${eur(trans.transporteInterior)}`} />
        </ul>
        {trans.total > 0 ? (
          <p className="nota" style={{ color: 'var(--muted)', marginTop: 10 }}>
            Equivale al {decimal(trans.pesoSobreImporte ?? 0)} % del importe de compra del ejercicio.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Evolución mensual · {d.anio} frente a {previo}</h2>
        <GraficoBarras series={barras} formato={eur} leyenda={{ a: String(d.anio), b: String(previo) }} />
        <div style={{ marginTop: 12 }}>
          <DescargarExcel
            nombre="facturacion-mensual"
            columnas={['Mes', 'Neta', 'Unidades', 'Facturas', 'Presupuesto', 'Neta previo']}
            registros={d.series.map((s) => [s.mes, s.neta, s.unidades, s.facturas, s.presupuesto ?? '', s.netaPrevio ?? ''])}
            etiqueta="Exportar evolución mensual"
          />
        </div>
      </div>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación acumulada ${t.proyeccion.anio} (YTD)`} valor={eur(t.proyeccion.ytd)} nota={`ritmo diario ${eur(t.proyeccion.ritmoDiario)}`} />
        <Kpi etiqueta="Proyección de cierre de año" valor={eur(t.proyeccion.proyectado)} nota={`${t.proyeccion.diasRestantes} días por delante`} />
        <Kpi etiqueta="Cumplimiento presupuesto proyectado" valor={t.proyeccion.cumplimientoProyectado === null ? '—' : `${decimal(t.proyeccion.cumplimientoProyectado)} %`} nota={`presupuesto ${eur(t.proyeccion.presupuesto)}`} />
      </ul>

      <div className="card">
        <h2>Últimos 12 meses rodantes</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="td-num">Facturación neta</th>
            </tr>
          </thead>
          <tbody>
            {t.rodante12m.map((r) => (
              <tr key={r.mes}>
                <td>{r.mes}</td>
                <td className="td-num">{eur(r.neta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Últimas 12 semanas (ISO)</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Semana</th>
              <th className="td-num">Facturación neta</th>
              <th className="td-num">Facturas</th>
            </tr>
          </thead>
          <tbody>
            {t.semanal.map((s) => (
              <tr key={s.semana}>
                <td>{s.semana}</td>
                <td className="td-num">{eur(s.neta)}</td>
                <td className="td-num">{numero(s.facturas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Últimos 30 días</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Día</th>
              <th className="td-num">Facturación neta</th>
              <th className="td-num">Facturas</th>
            </tr>
          </thead>
          <tbody>
            {t.diaria.map((dd) => (
              <tr key={dd.fecha}>
                <td>{dd.fecha}</td>
                <td className="td-num">{eur(dd.neta)}</td>
                <td className="td-num">{numero(dd.facturas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <DescargarExcel
            nombre="facturacion-30-dias"
            columnas={['Día', 'Neta', 'Facturas']}
            registros={t.diaria.map((dd) => [dd.fecha, dd.neta, dd.facturas])}
            etiqueta="Exportar últimas vistas temporales"
          />
        </div>
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

      <div className="card">
        <h2>Desviación presupuestaria por dimensión · {d.anio}</h2>
        {desvio.sinPresupuesto ? (
          <p style={{ color: 'var(--muted)' }}>No hay presupuesto cargado para {d.anio}.</p>
        ) : (
          <>
            <h3 style={{ fontSize: 15, margin: '12px 0 4px' }}>Por comercial</h3>
            <TablaDesvio filas={desvio.porComercial} />
            <h3 style={{ fontSize: 15, margin: '20px 0 4px' }}>Por cliente</h3>
            <TablaDesvio filas={desvio.porCliente} />
            <h3 style={{ fontSize: 15, margin: '20px 0 4px' }}>Por familia</h3>
            <TablaDesvio filas={desvio.porFamilia} />
          </>
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