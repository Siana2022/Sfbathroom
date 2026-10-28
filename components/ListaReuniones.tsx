'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ETIQUETA_MODALIDAD } from '@/lib/comercial/tipos';

export type ReunionVista = {
  id: string;
  cliente_id: string;
  cliente: string;
  contacto: string | null;
  asunto: string | null;
  fecha_hora: string;
  duracion_min: number | null;
  modalidad: string | null;
  estado: string;
  notas: string | null;
  interaccion_id: string | null;
};

type Props = {
  reuniones: ReunionVista[];
  /** Si se pasa, cada fila enlaza a la ficha del cliente. */
  conEnlace?: boolean;
  /** Permite cerrar la reunión (realizada/cancelada) desde aquí. */
  editable?: boolean;
};

function formatear(iso: string): { dia: string; hora: string; relativo: string } {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const hoy = new Date();
  const dias = Math.round((d.getTime() - Date.now()) / 86400000);
  let relativo = '';
  if (d.toDateString() === hoy.toDateString()) relativo = 'hoy';
  else if (dias === 1) relativo = 'mañana';
  else if (dias === -1) relativo = 'ayer';
  else if (dias > 1 && dias < 7) relativo = `en ${dias} días`;
  else if (dias < -1 && dias > -7) relativo = `hace ${Math.abs(dias)} días`;
  return { dia, hora, relativo };
}

/** Agenda de reuniones. Permite cerrarlas volcando el resultado al histórico. */
export default function ListaReuniones({ reuniones, conEnlace, editable }: Props) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [contenido, setContenido] = useState('');

  async function cerrar(id: string, nuevoEstado: 'realizada' | 'cancelada') {
    setCerrando(id);
    setError(null);
    try {
      const res = await fetch(`/api/comercial/reuniones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: nuevoEstado,
          volcar_interaccion: nuevoEstado === 'realizada',
          contenido_interaccion: contenido || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar.');
      setAbierta(null);
      setContenido('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar.');
    } finally {
      setCerrando(null);
    }
  }

  if (reuniones.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>No hay reuniones en la agenda.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {error && <p style={{ color: 'var(--error, darkred)', fontSize: 13 }}>{error}</p>}
      {reuniones.map((r) => {
        const f = formatear(r.fecha_hora);
        const pasada = Date.parse(r.fecha_hora) < Date.now();
        return (
          <div
            key={r.id}
            style={{
              border: '1px solid var(--borde, #e5e5e5)',
              borderRadius: 6,
              padding: '10px 12px',
              display: 'grid',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{f.dia} · {f.hora}</strong>
              {f.relativo && <span className="badge">{f.relativo}</span>}
              {r.modalidad && <span className="badge">{ETIQUETA_MODALIDAD[r.modalidad] ?? r.modalidad}</span>}
              {r.duracion_min !== null && (
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{r.duracion_min} min</span>
              )}
              {r.estado !== 'programada' && <span className="badge">{r.estado}</span>}
              {r.interaccion_id && (
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>· volcada al histórico</span>
              )}
            </div>
            <div>
              {conEnlace ? (
                <Link href={`/comercial/clientes/${r.cliente_id}`}><strong>{r.cliente}</strong></Link>
              ) : (
                <strong>{r.cliente}</strong>
              )}
              {r.asunto && <> · {r.asunto}</>}
              {r.contacto && <span style={{ color: 'var(--muted)' }}> · {r.contacto}</span>}
            </div>
            {r.notas && <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>{r.notas}</p>}

            {editable && r.estado === 'programada' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {abierta === r.id ? (
                  <>
                    <textarea
                      className="input-dato"
                      rows={2}
                      style={{ flex: 1, minWidth: 220 }}
                      value={contenido}
                      onChange={(e) => setContenido(e.target.value)}
                      placeholder="Resumen de lo tratado (se guardará en el histórico)"
                    />
                    <button className="btn" type="button" disabled={cerrando === r.id} onClick={() => cerrar(r.id, 'realizada')}>
                      {cerrando === r.id ? 'Guardando…' : 'Confirmar realizada'}
                    </button>
                    <button className="boton" type="button" onClick={() => setAbierta(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="boton" type="button" onClick={() => setAbierta(r.id)}>
                      {pasada ? 'Marcar realizada' : 'Cerrar'}
                    </button>
                    <button className="boton" type="button" disabled={cerrando === r.id} onClick={() => cerrar(r.id, 'cancelada')}>
                      Anular
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
