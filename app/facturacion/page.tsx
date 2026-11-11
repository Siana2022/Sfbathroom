import { cookies } from 'next/headers';
import Link from 'next/link';
import { getFacturacion, getVariacion, getRankingsFacturacion, getSeriesKpisMensual } from '@/lib/datos/facturacion';
import { getVistasTemporales } from '@/lib/datos/vistas';
import { getDesvioPresupuesto } from '@/lib/datos/desvioPresupuesto';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero, pct } from '@/lib/formato';
import GraficoBarras, { type Barra } from '@/components/GraficoBarras';
import KpisFacturacion, { type KpiFact } from '@/components/KpisFacturacion';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import Aviso from '@/components/Aviso';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

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
  // Todas las consultas en paralelo (antes eran 7 awaits en serie → 10-15 s con filtros).
  const [opciones, d, t, v, desvio, rk, seriesKpis] = await Promise.all([
    getOpcionesFiltros(empresa, { fuente: 'facturas', anio: ANIO }),
    getFacturacion(empresa, ANIO, filtros),
    getVistasTemporales(empresa, ANIO, filtros),
    getVariacion(empresa, ANIO, filtros),
    getDesvioPresupuesto(empresa, ANIO, filtros),
    getRankingsFacturacion(empresa, ANIO, filtros),
    getSeriesKpisMensual(empresa, ANIO, filtros),
  ]);
  const previo = d.anioPrevio;
  const delta = d.netaPrevioTotal > 0 ? pct(((d.neta - d.netaPrevioTotal) / d.netaPrevioTotal) * 100) : '—';

  const barras: Barra[] = d.series.map((s) => ({
    etiqueta: NOMBRE_MES[s.mes],
    valor: s.neta,
    valor2: s.netaPrevio,
    titulo: `${NOMBRE_MES[s.mes]} ${d.anio}`,
  }));

  const kpisFact: KpiFact[] = [
    { clave: 'neta', etiqueta: `Facturación neta ${d.anio}`, valor: eur(d.neta), nota: `vs ${previo}: ${delta}` },
    { clave: 'ytd', etiqueta: `Facturación acumulada ${t.proyeccion.anio} (YTD)`, valor: eur(t.proyeccion.ytd), nota: `ritmo diario ${eur(t.proyeccion.ritmoDiario)}` },
    { clave: 'proyeccion', etiqueta: 'Proyección de cierre de año', valor: eur(t.proyeccion.proyectado), nota: `${t.proyeccion.diasRestantes} días por delante` },
    { clave: 'cumplimiento_proy', etiqueta: 'Cumplimiento presupuesto proyectado', valor: t.proyeccion.cumplimientoProyectado === null ? '—' : `${decimal(t.proyeccion.cumplimientoProyectado)} %`, nota: `presupuesto ${eur(t.proyeccion.presupuesto)}` },
    { clave: 'desviacion', etiqueta: 'Desviación presupuesto', valor: d.cumplimiento === null ? '—' : `${decimal(d.cumplimiento)} %`, nota: d.cumplimiento === null ? 'sin presupuesto' : `presupuesto ${eur(d.presupuesto)}` },
    { clave: 'unidades', etiqueta: 'Unidades facturadas', valor: numero(d.unidades), nota: `${d.nFacturas} facturas emitidas` },
    { clave: 'ticket', etiqueta: 'Ticket medio por factura', valor: eur(d.ticketMedio), nota: 'sobre facturas netas' },
    { clave: 'precio', etiqueta: 'Precio medio de venta', valor: eur(d.precioMedio), nota: 'por unidad facturada' },
  ];

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 1</p>
      <h1>Facturación</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Facturación neta de {d.empresa.nombre} ({d.empresa.codigo}). Neta = facturas + notas de
        cargo − abonos, imputando cada documento en su fecha.{' '}
        <Link className="doc-enlace" href="/documentos">
          Drill-down: ver los documentos origen →
        </Link>
      </p>

      <Filtros opciones={opciones} />

      {d.presupuesto === 0 && (
        <Aviso tipo="info">
          No hay presupuesto cargado para {d.anio}: los indicadores de cumplimiento y desviación
          quedan en blanco hasta que se importe el presupuesto del ejercicio.
        </Aviso>
      )}

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>
        Pincha cualquier KPI para ver su evolución mensual ({d.anio} vs {previo}).
      </p>
      <KpisFacturacion kpis={kpisFact} series={seriesKpis} anio={d.anio} anioPrevio={previo} />

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

      <div className="card">
        <h2>TOP 10 referencias vendidas · {filtros.cliente ? 'cliente seleccionado' : 'global'} {d.anio}</h2>
        {rk.topReferencias.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin datos para la selección.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Referencia</th>
                <th className="td-num">Unidades</th>
                <th className="td-num">Facturado</th>
              </tr>
            </thead>
            <tbody>
              {rk.topReferencias.map((r, i) => (
                <tr key={i}>
                  <td>{r.codigo ? `${r.codigo} · ` : ''}{r.articulo}</td>
                  <td className="td-num">{numero(r.unidades)}</td>
                  <td className="td-num">{eur(r.neta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>TOP 20 clientes por facturación · {d.anio}</h2>
        {rk.topClientes.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin datos.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Facturado</th>
                <th className="td-num">Unidades</th>
                <th>Comercial</th>
                <th className="td-num">vs {previo}</th>
              </tr>
            </thead>
            <tbody>
              {rk.topClientes.map((c, i) => {
                const vp = c.netaPrev > 0 ? ((c.neta - c.netaPrev) / c.netaPrev) * 100 : null;
                return (
                  <tr key={i}>
                    <td>{c.cliente}</td>
                    <td className="td-num">{eur(c.neta)}</td>
                    <td className="td-num">{numero(c.unidades)}</td>
                    <td>{c.comercial}</td>
                    <td className={`td-num ${vp != null && vp >= 0 ? 'td-pos' : ''}`}>
                      {vp === null ? '—' : `${vp > 0 ? '+' : ''}${decimal(vp)} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Comerciales por facturación · {d.anio}</h2>
        {rk.comerciales.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin datos.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Comercial</th>
                <th className="td-num">Año</th>
                <th className="td-num">Importe vendido</th>
                <th className="td-num">Unidades</th>
                <th className="td-num">vs {previo}</th>
              </tr>
            </thead>
            <tbody>
              {rk.comerciales.map((c, i) => {
                const vp = c.importePrev > 0 ? ((c.importe - c.importePrev) / c.importePrev) * 100 : null;
                return (
                  <tr key={i}>
                    <td>{c.comercial}</td>
                    <td className="td-num">{c.anio}</td>
                    <td className="td-num">{eur(c.importe)}</td>
                    <td className="td-num">{numero(c.unidades)}</td>
                    <td className={`td-num ${vp != null && vp >= 0 ? 'td-pos' : ''}`}>
                      {vp === null ? '—' : `${vp > 0 ? '+' : ''}${decimal(vp)} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <details className="card panel-desplegable">
        <summary>Últimos 12 meses rodantes</summary>
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
      </details>

      <details className="card panel-desplegable">
        <summary>Últimas 12 semanas (ISO)</summary>
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
      </details>

      <details className="card panel-desplegable">
        <summary>Últimos 30 días</summary>
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
      </details>

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