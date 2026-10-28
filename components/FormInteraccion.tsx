'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIPOS_INTERACCION, RESULTADOS_INTERACCION } from '@/lib/comercial/tipos';

type ContactoMin = { id: string; nombre: string; apellidos: string | null };

type Props = {
  clienteId: string;
  empresaCodigo: string;
  contactos: ContactoMin[];
};

/** Registro manual de una llamada, email, reunión, visita o nota. */
export default function FormInteraccion({ clienteId, empresaCodigo, contactos }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState('llamada');
  const [contactoId, setContactoId] = useState('');
  const [asunto, setAsunto] = useState('');
  const [contenido, setContenido] = useState('');
  const [resultado, setResultado] = useState('');
  const [duracion, setDuracion] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setEstado(null);
    try {
      const res = await fetch('/api/comercial/interacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId,
          empresa_codigo: empresaCodigo,
          tipo,
          contacto_id: contactoId || null,
          asunto,
          contenido,
          resultado: resultado || null,
          duracion_min: duracion === '' ? null : Number(duracion),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar.');
      setEstado({ tipo: 'ok', mensaje: 'Interacción registrada.' });
      setAsunto('');
      setContenido('');
      setResultado('');
      setDuracion('');
      router.refresh();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'Error al guardar.' });
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <label>
          Tipo
          <select className="input-dato" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_INTERACCION.map((t) => (
              <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
            ))}
          </select>
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
          Resultado
          <select className="input-dato" value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="">—</option>
            {RESULTADOS_INTERACCION.map((r) => (
              <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
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
        <input className="input-dato" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Motivo de la llamada" />
      </label>
      <label>
        Contenido *
        <textarea
          className="input-dato"
          rows={4}
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder="Escribe aquí lo hablado, acuerdos, peticiones…"
          required
        />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" type="submit" disabled={cargando || contenido.trim() === ''}>
          {cargando ? 'Guardando…' : 'Registrar interacción'}
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
