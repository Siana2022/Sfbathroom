import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  getPanelComercial,
  normalizarRango,
  ordenarPorUrgencia,
  rangoPorDefecto,
  type FilaPanel,
} from '@/lib/datos/panelComercial';
import { getContextoComercial } from '@/lib/datos/comercial';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import Aviso from '@/components/Aviso';
import SelectorFechas from '@/components/SelectorFechas';
import ListaReuniones from '@/components/ListaReuniones';

export const dynamic = 'force-dynamic';

type SearchParams = { [key: string]: string | string[] | undefined };

function fechaLarga(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Distintivo de estado comercial del cliente en el periodo. */
function Distintivo({ fila }: { fila: FilaPanel }) {
  if (fila.estadoComercial === 'ganado') return <span className="badge listo">Ganado</span>;
  if (fila.estadoComercial === 'perdido') return <span className="badge pendiente">Perdido</span>;
  if (fila.vencido) return <span className="badge pendiente">A llamar</span>;
  return null;
}

/** Panel de trabajo del comercial: cartera, alertas por cadencia y agenda. */
export default async function ComercialPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const rango = normalizarRango(
    typeof searchParams.desde === 'string' ? searchParams.desde : undefined,
    typeof searchParams.hasta === 'string' ? searchParams.hasta : undefined,
  );

  const [d, contexto] = await Promise.all([getPanelComercial(empresa, rango), getContextoComercial()]);
  const filas = ordenarPorUrgencia(d.filas);
  const k = d.kpis;

  const def = rangoPorDefecto();
  const conPeriodo = rango.desde !== def.desde || rango.hasta !== def.hasta;
  const variacion = k.variacion === null ? null : Math.round(k.variacion * 10) / 10;

  return (
    <div>
      <p className="breadcrumb">Acceso comercial</p>
      <h1>Mi cartera</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 860 }}>
        {contexto.comercialNombre ? <>Cartera de <strong>{contexto.comercialNombre}</strong>. </> : null}
        {fechaLarga(rango.desde)} – {fechaLarga(rango.hasta)}. Arriba están los clientes que requieren una llamada:
        se compara el tiempo sin pedir con <strong>cada cuánto pide cada uno</strong>, no con un umbral fijo.
      </p>

      {!contexto.puedeEscribir && (
        <Aviso tipo="info">
          Tu rol es de solo lectura en este módulo: puedes consultar la cartera y la agenda, pero no registrar cambios.
        </Aviso>
      )}

      <SelectorFechas />

      <ul className="grid-kpis">
        <Kpi
          etiqueta="Facturación del periodo"
          valor={eur(k.facturacion)}
          nota={`${fechaLarga(rango.desde)} – ${fechaLarga(rango.hasta)}`}
        />
        <Kpi
          etiqueta="Variación vs anterior"
          valor={variacion === null ? '—' : `${variacion > 0 ? '+' : ''}${numero(variacion)} %`}
          nota={k.facturacionPrevia > 0 ? `antes ${eur(k.facturacionPrevia)}` : 'sin base de comparación'}
        />
        <Kpi etiqueta="Clientes en cartera" valor={numero(k.clientes)} nota={`${numero(k.vencidos)} requieren llamada`} />
        <Kpi etiqueta="Clientes ganados" valor={numero(k.ganados)} nota="primer pedido en el periodo" />
        <Kpi etiqueta="Clientes perdidos" valor={numero(k.perdidos)} nota="+90 días sin pedir" />
        <Kpi etiqueta="Reuniones próximas" valor={numero(k.reunionesProximas)} nota="en agenda" />
      </ul>

      <div className="card">
        <h2>Agenda · próximas reuniones</h2>
        {d.agenda.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No hay reuniones programadas. Agenda una desde la ficha de cualquier cliente.
          </p>
        ) : (
          <ListaReuniones
            reuniones={d.agenda.map((r) => ({
              id: r.id,
              cliente_id: r.cliente_id,
              cliente: r.cliente,
              contacto: r.contacto,
              asunto: r.asunto,
              fecha_hora: r.fecha_hora,
              duracion_min: r.duracion_min,
              modalidad: r.modalidad,
              estado: r.estado,
              notas: r.notas,
              interaccion_id: r.interaccion_id,
            }))}
            conEnlace
            editable={contexto.puedeEscribir}
          />
        )}
      </div>

      <div className="card">
        <h2>Cartera · {d.empresa.nombre}</h2>
        {filas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No hay clientes asignados a tu cartera.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Provincia</th>
                  <th>Cadencia</th>
                  <th className="td-num">Días sin pedir</th>
                  <th className="td-num">Pedidos periodo</th>
                  <th className="td-num">Importe periodo</th>
                  <th className="td-num">Contactos</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.cliente_id}>
                    <td>{f.cliente}</td>
                    <td>{f.provincia ?? f.pais ?? '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{f.cadenciaTexto}</td>
                    <td className={`td-num ${f.vencido ? 'td-pos' : ''}`}>
                      {f.diasSinPedir === null ? 'sin pedidos' : numero(f.diasSinPedir)}
                    </td>
                    <td className="td-num">{f.pedidosPeriodo === 0 ? '—' : numero(f.pedidosPeriodo)}</td>
                    <td className="td-num">{f.importePeriodo === 0 ? '—' : eur(f.importePeriodo)}</td>
                    <td className="td-num">{f.contactos === 0 ? '—' : numero(f.contactos)}</td>
                    <td><Distintivo fila={f} /></td>
                    <td>
                      <Link className="enlace" href={`/comercial/clientes/${f.cliente_id}`}>Ficha</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {conPeriodo && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
            Mostrando el periodo elegido. <Link className="enlace" href="/comercial">Volver a los últimos 90 días</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
