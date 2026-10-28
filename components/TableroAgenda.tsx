'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  COLUMNAS_AGENDA,
  agruparPorEstado,
  contarPorColumna,
  filtrarPorModalidad,
  type FiltroModalidad,
} from '@/lib/comercial/agenda';
import { ETIQUETA_MODALIDAD, type EstadoReunion, type ReunionConContexto } from '@/lib/comercial/tipos';

type Props = {
  reuniones: ReunionConContexto[];
  filtro: FiltroModalidad;
  /** Permite arrastrar para cerrar o anular. */
  editable: boolean;
  /** Cada tarjeta enlaza a la ficha del cliente. */
  conEnlace?: boolean;
};

function formatear(iso: string): { dia: string; hora: string } {
  const d = new Date(iso);
  return {
    dia: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', weekday: 'short' }),
    hora: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Texto de una columna sin tarjetas visibles. Distingue «no hay nada» de «lo
 * hay, pero el filtro lo esconde»: son situaciones distintas y confundirlas
 * hace pensar que la agenda está vacía cuando no lo está.
 */
function textoVacio(estado: EstadoReunion, hayFiltro: boolean, editable: boolean): string {
  if (hayFiltro) return 'Ninguna reunión de esta modalidad';
  if (estado === 'programada') return 'Sin reuniones programadas';
  if (!editable) return estado === 'realizada' ? 'Sin reuniones realizadas' : 'Sin reuniones anuladas';
  return estado === 'realizada'
    ? 'Arrastra aquí para cerrar y volcar al histórico'
    : 'Arrastra aquí para anular';
}

/**
 * Tablero de agenda: columnas por estado, filtro transversal por modalidad.
 *
 * Las columnas son el estado (donde vive el trabajo) y la modalidad es un filtro
 * que las atraviesa. Arrastrar una tarjeta a otra columna la cierra: es el mismo
 * cambio que antes exigía pulsar un botón escondido dentro de cada fila.
 */
export default function TableroAgenda({ reuniones, filtro, editable, conEnlace }: Props) {
  const router = useRouter();
  const [sobre, setSobre] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cierre pendiente de confirmar: al soltar en «Realizada» se pide el resumen. */
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [contenido, setContenido] = useState('');

  const columnas = agruparPorEstado(reuniones);
  const cuentaColumna = contarPorColumna(columnas, filtro);

  async function cerrar(id: string, nuevoEstado: 'realizada' | 'cancelada', resumen?: string) {
    setCerrando(id);
    setError(null);
    try {
      const res = await fetch(`/api/comercial/reuniones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: nuevoEstado,
          volcar_interaccion: nuevoEstado === 'realizada',
          contenido_interaccion: resumen || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar.');
      setPendiente(null);
      setContenido('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar.');
    } finally {
      setCerrando(null);
    }
  }

  function soltar(estado: EstadoReunion, id: string) {
    const reu = reuniones.find((r) => r.id === id);
    if (!reu || reu.estado === estado) return;
    // Solo se cierran reuniones programadas. Mover una ya cerrada entre
    // columnas sería ambiguo (¿reabrir? ¿y su interacción volcada?), así que
    // las tarjetas cerradas no son arrastrables.
    if (estado === 'realizada') {
      // Cerrar como realizada vuelca el resultado al histórico, así que se pide
      // el resumen antes de confirmar: el gesto no debe perder esa información.
      setPendiente(id);
      setContenido(reu.notas ?? '');
      return;
    }
    if (estado === 'cancelada') {
      void cerrar(id, 'cancelada');
    }
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo)', fontSize: 13, marginTop: 0 }}>{error}</p>}

      <div className="tablero-agenda">
        {COLUMNAS_AGENDA.map(({ estado, etiqueta }) => {
          const visibles = filtrarPorModalidad(columnas[estado], filtro);
          const hayFiltro = filtro !== 'todas';
          return (
            <div
              key={estado}
              className={`columna-agenda ${sobre === estado ? 'sobre' : ''}`}
              onDragOver={
                editable
                  ? (e) => {
                      e.preventDefault();
                      setSobre(estado);
                    }
                  : undefined
              }
              onDragLeave={editable ? () => setSobre(null) : undefined}
              onDrop={
                editable
                  ? (e) => {
                      e.preventDefault();
                      setSobre(null);
                      const id = e.dataTransfer.getData('text/plain');
                      if (id) soltar(estado, id);
                    }
                  : undefined
              }
            >
              <div className="columna-agenda-cab">
                <h3>
                  <span className={`punto-estado punto-${estado}`} />
                  {etiqueta}
                </h3>
                <span className="contador">{cuentaColumna[estado]}</span>
              </div>

              <div className="columna-agenda-cuerpo">
                {visibles.map((r) => {
                  const f = formatear(r.fecha_hora);
                  const enEspera = pendiente === r.id;
                  const arrastrable = editable && r.estado === 'programada';
                  return (
                    <article
                      key={r.id}
                      className={`tarjeta-reunion ${arrastrando === r.id ? 'arrastrando' : ''}`}
                      draggable={arrastrable}
                      onDragStart={
                        arrastrable
                          ? (e) => {
                              e.dataTransfer.setData('text/plain', r.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setArrastrando(r.id);
                            }
                          : undefined
                      }
                      onDragEnd={arrastrable ? () => setArrastrando(null) : undefined}
                    >
                      <div className="tarjeta-reunion-cab">
                        <span className="dia">{f.dia}</span>
                        <span className="hora">{f.hora}</span>
                      </div>
                      <h4>{r.asunto || 'Reunión'}</h4>
                      <p className="meta">
                        {conEnlace ? (
                          <Link className="enlace" href={`/comercial/clientes/${r.cliente_id}`}>
                            {r.cliente}
                          </Link>
                        ) : (
                          r.cliente
                        )}
                        {r.contacto && <> · {r.contacto}</>}
                      </p>
                      <div className="pie">
                        {r.modalidad && <span className="pastilla">{ETIQUETA_MODALIDAD[r.modalidad] ?? r.modalidad}</span>}
                        {r.duracion_min !== null && <span className="pastilla">{r.duracion_min} min</span>}
                        {r.interaccion_id && <span className="pastilla ok">volcada al histórico</span>}
                        {r.estado === 'cancelada' && <span className="pastilla apagada">anulada</span>}
                      </div>
                      {r.notas && (
                        <p className="meta" style={{ marginTop: 6 }}>
                          {r.notas}
                        </p>
                      )}

                      {enEspera && (
                        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                          <textarea
                            className="input-dato"
                            rows={2}
                            value={contenido}
                            onChange={(e) => setContenido(e.target.value)}
                            placeholder="Resumen de lo tratado (se guardará en el histórico)"
                          />
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              className="btn"
                              type="button"
                              disabled={cerrando === r.id}
                              onClick={() => cerrar(r.id, 'realizada', contenido)}
                            >
                              {cerrando === r.id ? 'Guardando…' : 'Confirmar realizada'}
                            </button>
                            <button className="boton" type="button" onClick={() => setPendiente(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Arrastrar no existe con teclado ni en pantallas táctiles
                          antiguas, así que cerrar también tiene que poder hacerse
                          con un botón. */}
                      {arrastrable && !enEspera && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          <button className="boton" type="button" onClick={() => soltar('realizada', r.id)}>
                            Cerrar
                          </button>
                          <button
                            className="boton"
                            type="button"
                            disabled={cerrando === r.id}
                            onClick={() => soltar('cancelada', r.id)}
                          >
                            Anular
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}

                {visibles.length === 0 && (
                  <div className={`zona-vacia ${hayFiltro ? 'sin-resultados' : ''}`}>
                    {textoVacio(estado, hayFiltro, editable)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
