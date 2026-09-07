import { cookies } from 'next/headers';
import { getPedidos } from '@/lib/datos/pedidos';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

const ESTADOS_LABEL: Record<string, string> = {
  captado: 'Captado',
  aceptado: 'Aceptado',
  parcial: 'Servido parcial',
  servido: 'Servido',
  anulado: 'Anulado',
};

export default async function PedidosPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getPedidos(empresa, ANIO);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 2</p>
      <h1>Pedidos y cartera</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Captación de pedidos de {d.empresa.nombre}, cartera pendiente de servir, antigüedad y
        cumplimiento frente a la facturación.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Pedidos captados ${d.anio}`} valor={numero(d.captados)} nota={`importe ${eur(d.importeCaptado)}`} />
        <Kpi etiqueta="Cartera pendiente" valor={eur(d.enCarteraImporte)} nota={`${d.enCartera} pedidos abiertos`} />
        <Kpi etiqueta="Ratio servido / facturación" valor={d.ratioServidoVsFacturado === null ? '—' : `${decimal(d.ratioServidoVsFacturado)} %`} nota="importe servido vs facturación neta" />
        <Kpi etiqueta="Ticket medio por pedido" valor={eur(d.ticketMedio)} nota="importe captado entre pedidos no anulados" />
        <Kpi etiqueta="Pedidos servidos" valor={numero(d.servidos)} nota={`importe ${eur(d.importeServido)}`} />
        <Kpi etiqueta="Pedidos anulados" valor={numero(d.anulados)} nota={`importe ${eur(d.importeAnulado)}`} />
        <Kpi etiqueta="Antigüedad media cartera" valor={`${Math.round(d.antiguedadMediaCartera)} días`} nota="desde fecha de entrada" />
        <Kpi etiqueta="Plazo medio entrada → entrega" valor={d.plazoMedioEntrega === null ? '—' : `${Math.round(d.plazoMedioEntrega)} días`} nota="pedidos servidos" />
        <Kpi etiqueta="Cumplimiento fecha comprometida" valor={d.cumplimientoFecha === null ? '—' : `${decimal(d.cumplimientoFecha)} %`} nota="servidos a tiempo respecto a los solicitados" />
      </ul>

      <div className="card">
        <h2>Cartera pendiente por compromiso</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Compromiso (fecha solicitada)</th>
              <th className="td-num">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {d.carteraFechaSolicitada.map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td className="td-num">{eur(b.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Cartera pendiente por cliente</h2>
        {d.enCarteraCliente.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin cartera pendiente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Pedidos</th>
                <th className="td-num">Pendiente</th>
                <th className="td-num">Antigüedad media</th>
              </tr>
            </thead>
            <tbody>
              {d.enCarteraCliente.map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{c.pedidos}</td>
                  <td className="td-num">{eur(c.pendiente)}</td>
                  <td className="td-num">{Math.round(c.antiguedadMedia)} días</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Pedidos por estado</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Estado</th>
              <th className="td-num">Pedidos</th>
              <th className="td-num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {d.porEstado.map((e) => (
              <tr key={e.estado}>
                <td>{ESTADOS_LABEL[e.estado] ?? e.estado}</td>
                <td className="td-num">{numero(e.pedidos)}</td>
                <td className="td-num">{eur(e.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Anulaciones por motivo</h2>
        {d.anulacionesMotivo.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin anulaciones con motivo registrado.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Motivo</th>
                <th className="td-num">Pedidos</th>
                <th className="td-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.anulacionesMotivo.map((a) => (
                <tr key={a.motivo}>
                  <td>{a.motivo}</td>
                  <td className="td-num">{numero(a.pedidos)}</td>
                  <td className="td-num">{eur(a.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Modificaciones de pedido</h2>
        {d.modificados.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin modificaciones registradas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th className="td-num">Veces</th>
              </tr>
            </thead>
            <tbody>
              {d.modificados.map((m) => (
                <tr key={m.tipo}>
                  <td>{m.tipo}</td>
                  <td className="td-num">{numero(m.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}