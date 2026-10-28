'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MODALIDADES_REUNION } from '@/lib/comercial/tipos';

type ContactoMin = { id: string; nombre: string; apellidos: string | null };

type Props = {
  clienteId: string;
  empresaCodigo: string;
  contactos: ContactoMin[];
  /** Fecha/hora sugerida (por defecto, mañana a las 10:00). */
  porDefecto?: string;
};

/** Agenda una reunión con un cliente. */
export default function FormReunion({ clienteId, empresaCodigo, contactos, porDefecto }: Props) {
  const router = useRouter();
  const [fechaHora, setFechaHora] = useState(porDefecto ?? '');
  const [contactoId, setContactoId] = useState('');
  const [asunto, setAsunto] = useState('');
  const [modalidad, setModalidad] = useState('presencial');
  const [duracion, setDuracion] = useState('60');
  const [notas, setNotas] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setEstado(null);
    try {
      const res = await fetch('/api/comercial/reuniones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId,
          empresa_codigo: empresaCodigo,
          fecha_hora: fechaHora,
          contacto_id: contactoId || null,
          asunto,
          modalidad,
          duracion_min: duracion === '' ? null : Number(duracion),
          notas,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo agendar.');
      setEstado({ tipo: 'ok', mensaje: 'Reunión agendada.' });
      setAsunto('');
      setNotas('');
      router.refresh();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'Error al agendar.' });
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <label>
          Fecha y hora *
          <input
            className="input-dato"
            type="datetime-local"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.target.value)}
            required
          />
        </label>
        <label>
          Contacto
          <select className="input-dato" value={contactoId} onChange={(e) => setContactoId(e.target.value)}>
            <option value="">—</option>
            {contactos.map((c) => (
              <option key={c.id} value={c.id}>{`${c.nombre}${c.apellidos ? ` ${c.apellidos}` : ''}`}</option>
            ))}
          </select>
        </label>
        <label>
          Modalidad
          <select className="input-dato" value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
            {MODALIDADES_REUNION.map((m) => (
              <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
            ))}
          </select>
        </label>
        <label>
          Duración (min)
          <input className="input-dato" type="number" min="0" value={duracion} onChange={(e) => setDuracion(e.target.value)} />
        </label>
      </div>
      <label>
        Asunto
        <input className="input-dato" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Motivo de la reunión" />
      </label>
      <label>
        Notas previas
        <textarea className="input-dato" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Qué llevar preparado, puntos a tratar…" />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" type="submit" disabled={cargando || fechaHora === ''}>
          {cargando ? 'Agendando…' : 'Agendar reunión'}
        </button>
        {estado && (
          <span style={{ fontSize: 12, color: estado.tipo === 'error' ? 'var(--error, darkred)' : 'var(--muted)' }}>
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
