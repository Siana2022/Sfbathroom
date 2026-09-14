'use client';

import { useState } from 'react';

type Props = {
  alertaId: string;
  estadoActual?: string;
  asignadaActual?: string | null;
  perfiles: { id: string; full_name: string | null }[];
};

const ESTADOS = ['nueva', 'revisada', 'pospuesta', 'descartada'] as const;

export default function GestionAlerta({ alertaId, estadoActual, asignadaActual, perfiles }: Props) {
  const [estado, setEstado] = useState(estadoActual ?? 'nueva');
  const [asignada, setAsignada] = useState(asignadaActual ?? '');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function aplicar() {
    setCargando(true);
    setMensaje(null);
    try {
      const res = await fetch(`/api/alertas/${alertaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, asignada_a: asignada || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Error al guardar');
      }
      setMensaje('Guardado ✓');
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="gestion-alerta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className={`badge ${estado === 'nueva' ? 'construccion' : estado === 'revisada' ? 'listo' : 'pendiente'}`}>
        {estado}
      </span>
      <select className="input-dato" value={estado} onChange={(e) => setEstado(e.target.value)} disabled={cargando}>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>
      <select
        className="input-dato"
        value={asignada}
        onChange={(e) => setAsignada(e.target.value)}
        disabled={cargando}
        aria-label="Asignar a"
      >
        <option value="">Sin asignar</option>
        {perfiles.map((p) => (
          <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>
        ))}
      </select>
      <button type="button" className="btn" onClick={aplicar} disabled={cargando}>
        {cargando ? 'Guardando…' : 'Guardar'}
      </button>
      {mensaje && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{mensaje}</span>}
    </div>
  );
}