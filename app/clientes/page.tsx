import { cookies } from 'next/headers';
import { getClientes } from '@/lib/datos/clientes';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function ClientesPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getClientes(empresa, ANIO);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 5</p>
      <h1>Comportamiento de cliente</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Clientes activos, nuevos y perdidos de {d.empresa.nombre}, retención entre {ANIO - 1} y
        {d.anio}.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Clientes activos ${d.anio}`} valor={numero(d.activos)} nota={`en ${ANIO - 1}: ${d.activosPrevio}`} />
        <Kpi etiqueta="Clientes activos 12M" valor={numero(d.activos12m)} nota="con al menos un pedido en los últimos 12 meses" />
        <Kpi etiqueta="Tasa de retención" valor={d.retencion === null ? '—' : `${decimal(d.retencion)} %`} nota="siguen facturando año a año" />
        <Kpi etiqueta="Nuevos clientes" valor={numero(d.nuevos)} nota="no facturaron el año previo" />
        <Kpi etiqueta="Recuperados" valor={numero(d.recuperados)} nota="facturaron previo, no el actual" />
        <Kpi etiqueta="Clientes perdidos / inactivos" valor={numero(d.perdidos)} nota="estado marcado en el CRM" />
      </ul>

      <div className="card">
        <h2>Clientes sin actividad en 12 meses</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Aviso Q2: clientes con estado activo pero sin facturar desde hace más de 365 días.
          Candidatos a reactivación (o a su clasificación como perdidos).
        </p>
        {d.noActivos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Todos los clientes activos han facturado en los últimos 12 meses.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Días sin facturar</th>
                <th>Última factura</th>
              </tr>
            </thead>
            <tbody>
              {d.noActivos.map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td className={`td-num ${c.diasSin > 365 ? 'td-pos' : ''}`}>{numero(c.diasSin)}</td>
                  <td>{c.ultimaFactura}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Evolución por cliente: últimos 12M frente a los 12M previos</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Top de variación (ganadores y zonas de caída) para priorizar el plan de visita.
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="td-num">Neta 12M</th>
              <th className="td-num">Neta 12M previos</th>
              <th className="td-num">Delta</th>
              <th className="td-num">Delta %</th>
            </tr>
          </thead>
          <tbody>
            {d.movimiento.map((c) => (
              <tr key={c.nombre}>
                <td>{c.nombre}</td>
                <td className="td-num">{eur(c.netaActual)}</td>
                <td className="td-num">{eur(c.netaPrevia)}</td>
                <td className={`td-num ${c.delta < 0 ? 'td-pos' : ''}`}>{c.delta > 0 ? '+' : ''}{eur(c.delta)}</td>
                <td className={`td-num ${c.delta < 0 ? 'td-pos' : ''}`}>{c.deltaPct === null ? '—' : `${c.deltaPct > 0 ? '+' : ''}${decimal(c.deltaPct)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <DescargarExcel
            nombre="clientes-movimiento"
            columnas={['Cliente', 'Neta 12M', 'Neta 12M previos', 'Delta', 'Delta %']}
            registros={d.movimiento.map((c) => [c.nombre, c.netaActual, c.netaPrevia, c.delta, c.deltaPct])}
          />
        </div>
      </div>

      <div className="card">
        <h2>Cohortes mensuales de nuevos clientes</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Clientes que empezaron a facturar en cada mes de {ANIO - 1} y cuántos siguen comprando
          a día de hoy.
        </p>
        {d.cohortes.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin cohortes del ejercicio previo.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes de inicio</th>
                <th className="td-num">Nuevos</th>
                <th className="td-num">Activos hoy</th>
                <th className="td-num">Retención</th>
              </tr>
            </thead>
            <tbody>
              {d.cohortes.map((c) => (
                <tr key={c.mes}>
                  <td>{c.mes}</td>
                  <td className="td-num">{numero(c.nuevos)}</td>
                  <td className="td-num">{numero(c.activos12m)}</td>
                  <td className="td-num">{c.retencion === null ? '—' : `${decimal(c.retencion)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Clientes por facturación {d.anio}</h2>
        {d.tabla.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin facturación en el ejercicio.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Facturación neta</th>
                <th className="td-num">Facturas</th>
                <th className="td-num">Ticket medio</th>
              </tr>
            </thead>
            <tbody>
              {d.tabla.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{eur(c.neta)}</td>
                  <td className="td-num">{numero(c.facturas)}</td>
                  <td className="td-num">{eur(c.ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Matriz cliente × familia</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Familias compradas por cada cliente del top {d.matriz.length} por facturación en {d.anio}.
          Es el mapa de venta cruzada y, a la vez, el de vulnerabilidad: lo que un cliente no
          compra hoy es la oportunidad y también la exposición.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Neta</th>
                {d.familias.map((f) => (
                  <th key={f} title={f}>{f.length > 12 ? `${f.slice(0, 12)}…` : f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.matriz.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{eur(c.neta)}</td>
                  {c.compradas.map((s, i) => (
                    <td key={d.familias[i]} style={{ textAlign: 'center' }}>
                      <span className={s ? 'badge listo' : 'badge vacio'}>
                        {s ? '✓' : '·'}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Semáforo de fuga</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Clientes activos con días sin pedir por encima de su frecuencia histórica. Rojo:
          más de 2,5 veces su frecuencia habitual. Ámbar: entre su frecuencia y 2,5 veces.
        </p>
        {d.semaforo.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Ningún cliente activo está por encima de su frecuencia habitual.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Días sin pedir</th>
                <th className="td-num">Frecuencia habitual</th>
                <th>Semáforo</th>
              </tr>
            </thead>
            <tbody>
              {d.semaforo.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{numero(c.diasSin)}</td>
                  <td className="td-num">{c.frecuencia === null ? '—' : `${decimal(c.frecuencia)} días`}</td>
                  <td>
                    <span className={c.nivel === 'aviso' ? 'badge pendiente' : 'badge construccion'}>
                      {c.nivel === 'aviso' ? 'ámbar' : 'rojo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}