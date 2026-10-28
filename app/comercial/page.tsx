import { Suspense } from 'react';
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
import { contarPorModalidad, normalizarFiltroModalidad, porDefectoReunion, ventanaAgenda } from '@/lib/comercial/agenda';
import { filtrarCartera, normalizarFiltros, normalizarOrden, normalizarPagina, opcionesDe, ordenarCartera, paginar, hayFiltros } from '@/lib/comercial/carteraFiltros';
import { filtrarContactos, hayFiltrosContactos, normalizarFiltrosContactos, opcionesTerritorio } from '@/lib/comercial/contactosFiltros';
import { getContactos, getContextoComercial } from '@/lib/datos/comercial';
import { puedeElegirComercial } from '@/lib/comercial/roles';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import Aviso from '@/components/Aviso';
import SelectorFechas from '@/components/SelectorFechas';
import FiltroModalidad from '@/components/FiltroModalidad';
import TableroAgenda from '@/components/TableroAgenda';
import FiltrosCartera from '@/components/FiltrosCartera';
import ResumenEstados from '@/components/ResumenEstados';
import FiltrosContactos from '@/components/FiltrosContactos';
import Paginacion from '@/components/Paginacion';
import Pestanas, { type Pestana } from '@/components/Pestanas';
import SelectorEstadoCrm from '@/components/SelectorEstadoCrm';
import SelectorComercial from '@/components/SelectorComercial';
import FormReunion from '@/components/FormReunion';
import CabeceraOrdenable from '@/components/CabeceraOrdenable';

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

  const contexto = await getContextoComercial();

  // Dirección puede acotar el panel a la cartera de un comercial concreto; el
  // comercial no (su RLS ya limita las filas a lo suyo).
  const puedeElegir = puedeElegirComercial(contexto.rol);
  const comercialFiltro = puedeElegir && typeof searchParams.comercial === 'string' ? searchParams.comercial : null;

  const d = await getPanelComercial(empresa, rango, new Date(), comercialFiltro);

  const vista: Pestana =
    searchParams.vista === 'agenda' || searchParams.vista === 'seguimiento' || searchParams.vista === 'contactos'
      ? searchParams.vista
      : 'cartera';

  // El seguimiento solo se consulta si hace falta: la pestaña de cartera es la
  // que se abre por defecto y no debe pagar una consulta que no se va a ver.
  const seguimiento = vista === 'seguimiento' ? await getSeguimiento(empresa, ventanaAgenda(new Date())) : [];

  // Igual con los contactos: es la pestaña más pesada (toda la base de
  // contactos) y solo se carga cuando se va a mostrar.
  const contactos = vista === 'contactos' ? await getContactos(empresa) : null;
  const filtrosContactos = normalizarFiltrosContactos(searchParams);
  // Si dirección acotó el panel a una cartera, los contactos también se acotan:
  // la pestaña entera debe hablar de la misma cartera.
  const carteraIds = comercialFiltro ? new Set(d.filas.map((f) => f.cliente_id)) : null;
  const baseContactos = contactos
    ? carteraIds
      ? contactos.filas.filter((c) => carteraIds.has(c.cliente_id))
      : contactos.filas
    : [];
  const contactosFiltrados = filtrarContactos(baseContactos, filtrosContactos);
  const paginaContactos = paginar(contactosFiltrados, normalizarPagina(searchParams.pagina));

  const filtros = normalizarFiltros(searchParams);
  // Base: el orden de trabajo (urgencia). Si el usuario pide otra columna se
  // ordena sobre esa base, así los empates conservan el orden por urgencia en
  // vez de quedar en orden arbitrario.
  const filtradas = ordenarPorUrgencia(filtrarCartera(d.filas, filtros));
  const orden = normalizarOrden(searchParams.orden, searchParams.dir);
  const ordenadas = orden ? ordenarCartera(filtradas, orden) : filtradas;
  const pagina = paginar(ordenadas, normalizarPagina(searchParams.pagina));

  const k = d.kpis;
  const filtroModalidad = normalizarFiltroModalidad(searchParams.modalidad);
  const cuentaModalidad = contarPorModalidad(d.reuniones);

  // Enlace a la cartera filtrada por "requieren llamada". Se arrastran los
  // demás parámetros (periodo, ámbito de dirección) porque si no el clic
  // cambiaría la cartera que se está mirando.
  const qsLlamar = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'pagina' || k === 'llamar' || k === 'vista') continue;
      if (typeof v === 'string' && v !== '') p.set(k, v);
    }
    p.set('llamar', '1');
    return `/comercial?${p.toString()}`;
  })();

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

      {puedeElegir && (
        <div className="barra-filtros">
          <span className="barra-filtros-titulo">Ámbito</span>
          <Suspense fallback={null}>
            <SelectorComercial comerciales={d.comerciales} actual={d.comercialFiltro} />
          </Suspense>
        </div>
      )}

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
        <Kpi
          etiqueta="Clientes en cartera"
          valor={numero(k.clientes)}
          nota={`${numero(k.vencidos)} requieren llamada`}
          notaHref={vista === 'cartera' ? qsLlamar : undefined}
        />
        <Kpi etiqueta="Clientes ganados" valor={numero(k.ganados)} nota="primer pedido en el periodo" />
        <Kpi etiqueta="Clientes perdidos" valor={numero(k.perdidos)} nota="+90 días sin pedir" />
        <Kpi etiqueta="Reuniones próximas" valor={numero(k.reunionesProximas)} nota="en agenda" />
      </ul>

      {vista === 'cartera' && <ResumenEstados reparto={{ total: k.clientes, ...k.estados }} />}

      <Pestanas
        cuenta={{
          cartera: filtradas.length,
          agenda: d.reuniones.length,
          seguimiento: seguimiento.length,
          contactos: contactosFiltrados.length,
        }}
      />

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
                    <CabeceraOrdenable columna="cliente">Cliente</CabeceraOrdenable>
                    <CabeceraOrdenable columna="provincia">Provincia</CabeceraOrdenable>
                    <CabeceraOrdenable columna="cadencia">Días entre pedidos</CabeceraOrdenable>
                    <CabeceraOrdenable columna="diasSinPedir" numerica>Días sin pedir</CabeceraOrdenable>
                    <CabeceraOrdenable columna="pedidosPeriodo" numerica>Pedidos periodo</CabeceraOrdenable>
                    <CabeceraOrdenable columna="importePeriodo" numerica>Importe periodo</CabeceraOrdenable>
                    <CabeceraOrdenable columna="contactoHabitual">Contacto habitual</CabeceraOrdenable>
                    <CabeceraOrdenable columna="estado">Estado</CabeceraOrdenable>
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
                      <td className={`td-num ${f.vencido ? 'td-alerta' : ''}`}>
                        {f.diasSinPedir === null ? 'sin pedidos' : numero(f.diasSinPedir)}
                      </td>
                      <td className="td-num">{f.pedidosPeriodo === 0 ? '—' : numero(f.pedidosPeriodo)}</td>
                      <td className="td-num">{f.importePeriodo === 0 ? '—' : eur(f.importePeriodo)}</td>
                      <td>{f.contactoHabitual ?? <span style={{ color: 'var(--muted)' }}>sin asignar</span>}</td>
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
        <>
          <div className="card">
            <h2>Agenda</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
              {contexto.puedeEscribir
                ? 'Arrastra una tarjeta a otra columna para cerrar la reunión: al pasar a «Realizadas» se vuelca al histórico.'
                : 'Vista de solo lectura de la agenda.'}
            </p>

            {d.reuniones.length === 0 ? (
              <p style={{ color: 'var(--muted)', marginBottom: 0 }}>No hay reuniones en la agenda.</p>
            ) : (
              <>
                <FiltroModalidad cuenta={cuentaModalidad} />
                <TableroAgenda reuniones={d.reuniones} filtro={filtroModalidad} editable={contexto.puedeEscribir} conEnlace />
              </>
            )}
          </div>

          {contexto.puedeEscribir && (
            <div className="card">
              <h2>Agendar reunión</h2>
              <FormReunion
                empresaCodigo={empresa}
                contactos={[]}
                clientes={d.filas.map((f) => ({ id: f.cliente_id, nombre: f.cliente }))}
                porDefecto={porDefectoReunion()}
              />
            </div>
          )}
        </>
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
      {vista === 'contactos' && (
        <div className="card">
          <h2>Contactos · {d.empresa.nombre}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
            Personas de contacto de tu cartera, con país y provincia para segmentar envíos masivos.
          </p>

          <FiltrosContactos
            paises={opcionesTerritorio(baseContactos, 'pais')}
            provincias={opcionesTerritorio(baseContactos, 'provincia')}
          />

          {paginaContactos.filas.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              {hayFiltrosContactos(filtrosContactos)
                ? 'Ningún contacto cumple esos filtros.'
                : 'No hay contactos registrados en tu cartera.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th>Cargo</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th>País</th>
                    <th>Provincia</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {paginaContactos.filas.map((c) => (
                    <tr key={c.id}>
                      <td>{c.cliente}</td>
                      <td>
                        <strong>{c.nombre}</strong>
                        {c.apellidos ? ` ${c.apellidos}` : ''}
                      </td>
                      <td>{c.cargo ?? '—'}</td>
                      <td>{c.email ?? <span className="badge pendiente">sin email</span>}</td>
                      <td>{c.telefono ?? '—'}</td>
                      <td>{c.pais ?? '—'}</td>
                      <td>{c.provincia ?? '—'}</td>
                      <td>
                        <Link className="enlace" href={`/comercial/clientes/${c.cliente_id}`}>
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
            pagina={paginaContactos.pagina}
            totalPaginas={paginaContactos.totalPaginas}
            total={paginaContactos.total}
            desde={paginaContactos.desde}
            hasta={paginaContactos.hasta}
          />
        </div>
      )}
    </div>
  );
}
