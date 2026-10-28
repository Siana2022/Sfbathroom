'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HitoConAutor } from '@/lib/comercial/tipos';

type Props = {
  clienteId: string;
  empresaCodigo: string;
  hitos: HitoConAutor[];
  editable: boolean;
};

function fechaCorta(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Hitos del cliente: hechos con fecha que se quieren recordar (un acuerdo, un
 * cambio de responsable). No son interacciones: no hay conversación detrás.
 */
export default function ListaHitos({ clienteId, empresaCodigo, hitos, editable }: Props) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [fecha, setFecha] = useState(hoyISO());
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setEstado(null);
    try {
      const res = await fetch('/api/comercial/hitos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, empresa_codigo: empresaCodigo, fecha, titulo, detalle }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar el hito.');
      setTitulo('');
      setDetalle('');
      setFecha(hoyISO());
      setCreando(false);
      router.refresh();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'Error al guardar.' });
    } finally {
      setCargando(false);
    }
  }

  async function borrar(id: string) {
    setEstado(null);
    try {
      const res = await fetch(`/api/comercial/hitos/${id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo borrar.');
      router.refresh();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'Error al borrar.' });
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Hitos</h2>
        {editable && !creando && (
          <button className="btn" type="button" onClick={() => setCreando(true)}>
            Añadir hito
          </button>
        )}
      </div>

      {creando && (
        <form onSubmit={guardar} style={{ display: 'grid', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <label>
              Fecha
              <input className="input-dato" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </label>
            <label>
              Título *
              <input
                className="input-dato"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Qué ocurrió"
                required
              />
            </label>
          </div>
          <label>
            Detalle
            <textarea className="input-dato" rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" type="submit" disabled={cargando || titulo.trim() === ''}>
              {cargando ? 'Guardando…' : 'Guardar hito'}
            </button>
            <button className="btn" type="button" onClick={() => setCreando(false)} disabled={cargando}>
              Cancelar
            </button>
            {estado && <span style={{ fontSize: 12, color: 'var(--rojo)' }}>{estado.mensaje}</span>}
          </div>
        </form>
      )}

      {hitos.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Sin hitos registrados para este cliente.</p>
      ) : (
        <ul className="tablas" style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
          {hitos.map((h) => (
            <li key={h.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{h.titulo}</strong>
                  <span style={{ color: 'var(--muted)' }}>
                    {' '}
                    · {fechaCorta(h.fecha)}
                    {h.autor ? ` · ${h.autor}` : ''}
                  </span>
                  {h.detalle && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{h.detalle}</p>}
                </div>
                {editable && (
                  <button className="boton" type="button" onClick={() => borrar(h.id)}>
                    Borrar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {estado && !creando && <p style={{ color: 'var(--rojo)', fontSize: 12, marginTop: 8 }}>{estado.mensaje}</p>}
    </div>
  );
}
