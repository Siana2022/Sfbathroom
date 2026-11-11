import { cookies } from 'next/headers';
import { getPedidos } from '@/lib/datos/pedidos';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, fecha, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import Aviso from '@/components/Aviso';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

export default async function PedidosPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa, { fuente: 'pedidos', anio: ANIO });
  const d = await getPedidos(empresa, ANIO, filtros);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 2</p>
      <h1>Pedidos y cartera</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Pedidos de {d.empresa.nombre}, cartera pendiente de servir y entregas fuera de plazo.
      </p>

      <Filtros opciones={opciones} campos={['cliente', 'comercial', 'desde', 'hasta']} />

      {d.sinEnlaceFacturas && (
        <Aviso tipo="info">
          Todavía no hay facturas enlazadas a pedidos, así que <strong>servido</strong> y{' '}
          <strong>pendiente</strong> se estiman con la situación del pedido en A3ERP. Cuando la
          ingesta rellene el vínculo pedido → factura, estas cifras pasarán a calcularse por
          fecha de factura.
        </Aviso>
      )}

      {d.captados === 0 && (
        <Aviso tipo="info">
          No hay pedidos cargados para {d.anio} con los filtros actuales.
        </Aviso>
      )}

      <ul className="grid-kpis">
        <Kpi etiqueta={`Pedidos captados ${d.anio}`} valor={numero(d.captados)} nota={`importe ${eur(d.importeCaptado)}`} />
        <Kpi etiqueta="Cartera pendiente" valor={eur(d.importePendiente)} nota={`${numero(d.pendientes)} entregas programadas`} />
        <Kpi etiqueta="Pedidos servidos" valor={numero(d.servidos)} nota={`importe ${eur(d.importeServido)}`} />
        <Kpi etiqueta="Pedidos anulados" valor={numero(d.anulados)} nota={`importe ${eur(d.importeAnulado)}`} />
        <Kpi etiqueta="Ticket medio por pedido" valor={eur(d.ticketMedio)} nota="importe captado entre pedidos no anulados" />
        <Kpi etiqueta="Antigüedad media cartera" valor={`${Math.round(d.antiguedadMediaCartera)} días`} nota="desde la fecha de entrada" />
        <Kpi
          etiqueta="Plazo medio entrada → entrega"
          valor={d.plazoMedioEntrega === null ? '—' : `${Math.round(d.plazoMedioEntrega)} días`}
          nota="solo pedidos sin fecha programada"
        />
        <Kpi etiqueta="Pedidos con fecha programada" valor={numero(d.programados)} nota={`importe ${eur(d.importeProgramado)}`} />
        <Kpi
          etiqueta="Cumplimiento fecha comprometida"
          valor={d.cumplimientoFecha === null ? '—' : `${decimal(d.cumplimientoFecha)} %`}
          nota="facturados en la fecha programada o antes"
        />
      </ul>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Pedidos fuera de plazo de entrega</h2>
          <DescargarExcel
            nombre={`pedidos-fuera-plazo-${d.anio}`}
            columnas={['Cliente', 'Pedido', 'Entrega prevista', 'Días de retraso', 'Importe']}
            registros={d.fueraPlazo.map((f) => [f.cliente, f.numero, f.fechaPrevista, f.diasRetraso, f.importe])}
          />
        </div>
        <p className="nota" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Entrega prevista: la fecha programada del pedido; si no la tiene,{' '}
          {d.empresa.codigo === 'DOT' ? '21 días naturales' : '5 días hábiles'} desde la fecha de
          entrada. Solo pedidos pendientes de servir.
        </p>
        {d.fueraPlazo.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No hay pedidos abiertos fuera de plazo.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Pedido</th>
                <th>Entrega prevista</th>
                <th className="td-num">Días de retraso</th>
                <th className="td-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.fueraPlazo.map((f) => (
                <tr key={f.id}>
                  <td>{f.cliente}</td>
                  <td>{f.numero}</td>
                  <td>{fecha(f.fechaPrevista)}</td>
                  <td className="td-num" style={{ color: 'var(--rojo)', fontWeight: 600 }}>
                    {f.diasRetraso}
                  </td>
                  <td className="td-num">{eur(f.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {d.fueraPlazoTotal > d.fueraPlazo.length && (
          <p className="nota" style={{ color: 'var(--muted)' }}>
            Mostrando los {d.fueraPlazo.length} más retrasados de {numero(d.fueraPlazoTotal)}.
          </p>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Cartera pendiente por cliente</h2>
          <DescargarExcel
            nombre={`pedidos-cartera-por-cliente-${d.anio}`}
            columnas={['Cliente', 'Pedidos', 'Pendiente', 'Próxima entrega', 'Días']}
            registros={d.carteraCliente.map((c) => [
              c.nombre,
              c.pedidos,
              c.pendiente,
              c.proximaEntrega ?? '',
              c.diasHastaEntrega ?? '',
            ])}
          />
        </div>
        {d.carteraCliente.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin cartera pendiente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Pedidos</th>
                <th className="td-num">Pendiente</th>
                <th>Próxima entrega</th>
                <th className="td-num">Días</th>
              </tr>
            </thead>
            <tbody>
              {d.carteraCliente.map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{numero(c.pedidos)}</td>
                  <td className="td-num">{eur(c.pendiente)}</td>
                  <td>{fecha(c.proximaEntrega)}</td>
                  <td className="td-num">{c.diasHastaEntrega === null ? '—' : `${c.diasHastaEntrega} días`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Pedidos por estado</h2>
        {d.porEstado.map((e) => (
          <details key={e.estado} className="estado-grupo">
            <summary>
              <span>{e.label}</span>
              <span className="estado-cifras">
                {numero(e.pedidos)} pedidos · {eur(e.importe)}
              </span>
            </summary>
            {e.detalle.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Sin pedidos en este estado.</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Pedido</th>
                    <th>Entrada</th>
                    <th>Entrega prevista</th>
                    <th>Facturado</th>
                    <th className="td-num">Importe</th>
                    <th className="td-num">Retraso</th>
                  </tr>
                </thead>
                <tbody>
                  {e.detalle.map((p) => (
                    <tr key={p.id}>
                      <td>{p.cliente}</td>
                      <td>{p.numero}</td>
                      <td>{fecha(p.fechaEntrada)}</td>
                      <td>{fecha(p.fechaPrevista)}</td>
                      <td>{fecha(p.fechaFactura)}</td>
                      <td className="td-num">{eur(p.importe)}</td>
                      <td
                        className="td-num"
                        style={p.diasRetraso ? { color: 'var(--rojo)', fontWeight: 600 } : undefined}
                      >
                        {p.diasRetraso ? `${p.diasRetraso} días` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {e.total > e.detalle.length && (
              <p className="nota" style={{ color: 'var(--muted)' }}>
                Mostrando los {e.detalle.length} más recientes de {numero(e.total)}.
              </p>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
