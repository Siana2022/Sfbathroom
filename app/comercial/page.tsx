import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  getPanelComercial,
  getSeguimiento,
  normalizarRango,
  ordenarPorUrgencia,
  rangoPorDefecto,
  type FilaPanel,
} from '@/lib/datos/panelComercial';
import { contarPorModalidad, normalizarFiltroModalidad, ventanaAgenda } from '@/lib/comercial/agenda';
import { filtrarCartera, normalizarFiltros, normalizarPagina, opcionesDe, paginar, hayFiltros } from '@/lib/comercial/carteraFiltros';
import { getContextoComercial } from '@/lib/datos/comercial';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import Aviso from '@/components/Aviso';
import SelectorFechas from '@/components/SelectorFechas';
import FiltroModalidad from '@/components/FiltroModalidad';
import TableroAgenda from '@/components/TableroAgenda';
import FiltrosCartera from '@/components/FiltrosCartera';
import Paginacion from '@/components/Paginacion';
import Pestanas, { type Pestana } from '@/components/Pestanas';
import SelectorEstadoCrm from '@/components/SelectorEstadoCrm';

export const dynamic = 'force-dynamic';

type SearchParams = { [key: string]: string | string[] | undefined };

function fechaLarga(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Distintivo de estado comercial del cliente en el periodo. */
function Distintivo({ fila }: { fila: FilaPanel }) {
  if (fila.estadoComercial === 'ganado') return <span className="badge listo">Ganado</span>;
  if (fila.estadoComercial === 'perdido') return <span className="badge pendiente">Perdido</span>;
  if (fila.vencido) return <span className="badge pendiente">A llamar</span>;
  return null;
}

/** Acceso comercial: cartera, agenda y seguimiento en una sola pantalla. */
export default async function ComercialPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const rango = normalizarRango(
    typeof searchParams.desde === 'string' ? searchParams.desde : undefined,
    typeof searchParams.hasta === 'string' ? searchParams.hasta : undefined,
  );

  const [d, contexto] = await Promise.all([getPanelComercial(empresa, rango), getContextoComercial()]);

  const vista: Pestana =
    searchParams.vista === 'agenda' || searchParams.vista === 'seguimiento' ? searchParams.vista : 'cartera';

  // El seguimiento solo se consulta si hace falta: la pestaña de cartera es la
  // que se abre por defecto y no debe pagar una consulta que no se va a ver.
  const seguimiento = vista === 'seguimiento' ? await getSeguimiento(empresa, ventanaAgenda(new Date())) : [];

  const filtros = normalizarFiltros(searchParams);
  const filtradas = ordenarPorUrgencia(filtrarCartera(d.filas, filtros));
  const pagina = paginar(filtradas, normalizarPagina(searchParams.pagina));

  const k = d.kpis;
  const filtroModalidad = normalizarFiltroModalidad(searchParams.modalidad);
  const cuentaModalidad = contarPorModalidad(d.reuniones);

  const def = rangoPorDefecto();
  const conPeriodo = rango.desde !== def.desde || rango.hasta !== def.hasta;
  const variacion = k.variacion === null ? null : Math.round(k.variacion * 10) / 10;

  return (
    <div>
      <p className="breadcrumb">Acceso comercial</p>
      <h1>{vista === 'cartera' ? 'Mi cartera' : vista === 'agenda' ? 'Agenda' : 'Seguimiento'}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 860 }}>
        {contexto.comercialNombre ? (
          <>
            Cartera de <strong>{contexto.comercialNombre}</strong>.{' '}
          </>
        ) : null}
        {fechaLarga(rango.desde)} – {fechaLarga(rango.hasta)}.
        {vista === 'cartera' && ' Arriba están los clientes que requieren una llamada: se compara el tiempo sin pedir con '}
        {vista === 'cartera' && <strong>cada cuánto pide cada uno</strong>}
        {vista === 'cartera' && ', no con un umbral fijo.'}
      </p>

      {!contexto.puedeEscribir && (
        <Aviso tipo="info">
          Tu rol es de solo lectura en este módulo: puedes consultar la cartera y la agenda, pero no registrar cambios.
        </Aviso>
      )}

      <SelectorFechas />

      <ul className="grid-kpis">
        <Kpi etiqueta="Facturación del periodo" valor={eur(k.facturacion)} nota={`${fechaLarga(rango.desde)} – ${fechaLarga(rango.hasta)}`} />
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

      <Pestanas cuenta={{ cartera: filtradas.length, agenda: d.reuniones.length, seguimiento: seguimiento.length }} />

      {vista === 'cartera' && (
        <div className="card">
          <h2>Cartera · {d.empresa.nombre}</h2>

          <FiltrosCartera provincias={opcionesDe(d.filas, 'provincia')} paises={opcionesDe(d.filas, 'pais')} />

          {pagina.filas.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              {hayFiltros(filtros)
                ? 'Ningún cliente de tu cartera cumple esos filtros.'
                : 'No hay clientes asignados a tu cartera.'}
            </p>
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
                  {pagina.filas.map((f) => (
                    <tr key={f.cliente_id}>
                      <td>
                        <Link className="enlace" href={`/comercial/clientes/${f.cliente_id}`}>
                          {f.cliente}
                        </Link>
                      </td>
                      <td>{f.provincia ?? f.pais ?? '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{f.cadenciaTexto}</td>
                      <td className={`td-num ${f.vencido ? 'td-pos' : ''}`}>
                        {f.diasSinPedir === null ? 'sin pedidos' : numero(f.diasSinPedir)}
                      </td>
                      <td className="td-num">{f.pedidosPeriodo === 0 ? '—' : numero(f.pedidosPeriodo)}</td>
                      <td className="td-num">{f.importePeriodo === 0 ? '—' : eur(f.importePeriodo)}</td>
                      <td className="td-num">{f.contactos === 0 ? '—' : numero(f.contactos)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Distintivo fila={f} />
                          <SelectorEstadoCrm
                            clienteId={f.cliente_id}
                            estadoActual={f.estadoCrm}
                            motivoActual={f.motivoPerdida}
                            editable={contexto.puedeEscribir}
                          />
                        </div>
                      </td>
                      <td>
                        <Link className="enlace" href={`/comercial/clientes/${f.cliente_id}`}>
                          Ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Paginacion
            pagina={pagina.pagina}
            totalPaginas={pagina.totalPaginas}
            total={pagina.total}
            desde={pagina.desde}
            hasta={pagina.hasta}
          />

          {conPeriodo && (
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
              Mostrando el periodo elegido.{' '}
              <Link className="enlace" href="/comercial">
                Volver a los últimos 90 días
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {vista === 'agenda' && (
        <div className="card">
          <h2>Agenda</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
            {contexto.puedeEscribir
              ? 'Arrastra una tarjeta a otra columna para cerrar la reunión: al pasar a «Realizadas» se vuelca al histórico.'
              : 'Vista de solo lectura de la agenda.'}
          </p>
          {d.reuniones.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No hay reuniones en la agenda.</p>
          ) : (
            <>
              <FiltroModalidad cuenta={cuentaModalidad} />
              <TableroAgenda reuniones={d.reuniones} filtro={filtroModalidad} editable={contexto.puedeEscribir} conEnlace />
            </>
          )}
        </div>
      )}

      {vista === 'seguimiento' && (
        <div className="card">
          <h2>Seguimiento</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
            Reuniones ya cerradas. Revisa cada una y deja el estado del cliente en el mismo sitio.
          </p>
          {seguimiento.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No hay reuniones cerradas en la ventana de la agenda.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Asunto</th>
                    <th>Modalidad</th>
                    <th>Estado reunión</th>
                    <th>Estado cliente</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {seguimiento.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(r.fecha_hora)}</td>
                      <td>{r.cliente}</td>
                      <td>{r.asunto ?? '—'}</td>
                      <td>{r.modalidad === 'otros' ? r.modalidad_otro ?? 'Otros' : r.modalidad ?? '—'}</td>
                      <td>
                        <span className={`badge ${r.estado === 'realizada' ? 'listo' : 'pendiente'}`}>{r.estado}</span>
                      </td>
                      <td>
                        <SelectorEstadoCrm
                          clienteId={r.cliente_id}
                          estadoActual={r.estadoCrm}
                          motivoActual={r.motivoPerdida}
                          editable={contexto.puedeEscribir}
                        />
                      </td>
                      <td>
                        <Link className="enlace" href={`/comercial/clientes/${r.cliente_id}`}>
                          Ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
