'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MODALIDADES_REUNION } from '@/lib/comercial/tipos';

type ContactoMin = { id: string; nombre: string; apellidos: string | null };

type Props = {
  /** Si se pasa, la reunión es con ese cliente y no se pide elegirlo. */
  clienteId?: string;
  empresaCodigo: string;
  contactos: ContactoMin[];
  /** Clientes para el desplegable, cuando no se fija `clienteId`. */
  clientes?: { id: string; nombre: string }[];
  /** Fecha/hora sugerida (por defecto, mañana a las 10:00). */
  porDefecto?: string;
};

/**
 * Agenda una reunión. Sirve en dos sitios: dentro de la ficha (con el cliente
 * fijo) y en la pestaña de agenda (eligiendo el cliente). En el segundo caso los
 * contactos se cargan al elegir el cliente, porque no se conocen de antemano.
 */
export default function FormReunion({ clienteId, empresaCodigo, contactos, clientes, porDefecto }: Props) {
  const router = useRouter();
  const [cliente, setCliente] = useState(clienteId ?? '');
  const [cargados, setCargados] = useState<ContactoMin[]>([]);
  const [fechaHora, setFechaHora] = useState(porDefecto ?? '');
  const [contactoId, setContactoId] = useState('');
  const [contactoLibre, setContactoLibre] = useState('');
  const [asunto, setAsunto] = useState('');
  const [modalidad, setModalidad] = useState('presencial');
  const [modalidadOtro, setModalidadOtro] = useState('');
  const [duracion, setDuracion] = useState('60');
  const [notas, setNotas] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  // Con el cliente fijo los contactos llegan por props; si se elige aquí, hay
  // que pedirlos. Se deriva en vez de copiarse a estado: `contactos` puede ser
  // un array nuevo en cada render y sincronizarlo por estado daría un bucle.
  const listaContactos = clienteId ? contactos : cargados;

  /** Valor centinela del desplegable para escribir un nombre que no está dado de alta. */
  const OTRO = '__otro__';
  const escribiendo = contactoId === OTRO;

  useEffect(() => {
    if (clienteId || !cliente) {
      setCargados([]);
      return;
    }
    let vigente = true;
    setContactoId('');
    setContactoLibre('');
    fetch(`/api/comercial/contactos?cliente_id=${encodeURIComponent(cliente)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ContactoMin[]) => {
        if (vigente) setCargados(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (vigente) setCargados([]);
      });
    return () => {
      vigente = false;
    };
  }, [cliente, clienteId]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setEstado(null);
    try {
      const res = await fetch('/api/comercial/reuniones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: cliente,
          empresa_codigo: empresaCodigo,
          fecha_hora: fechaHora,
          contacto_id: contactoId && contactoId !== OTRO ? contactoId : null,
          contacto_nombre: contactoId === OTRO ? contactoLibre : null,
          asunto,
          modalidad,
          modalidad_otro: modalidad === 'otros' ? modalidadOtro : null,
          duracion_min: duracion === '' ? null : Number(duracion),
          notas,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo agendar.');
      setEstado({ tipo: 'ok', mensaje: 'Reunión agendada.' });
      setAsunto('');
      setNotas('');
      setModalidadOtro('');
      setContactoLibre('');
      if (!clienteId) {
        setCliente('');
        setContactoId('');
      }
      router.refresh();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'Error al agendar.' });
    } finally {
      setCargando(false);
    }
  }

  const faltanDatos = fechaHora === '' || cliente === '';

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {!clienteId && (
          <label>
            Cliente *
            <select className="input-dato" value={cliente} onChange={(e) => setCliente(e.target.value)} required>
              <option value="">—</option>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
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
          <select
            className="input-dato"
            value={contactoId}
            onChange={(e) => {
              setContactoId(e.target.value);
              if (e.target.value !== OTRO) setContactoLibre('');
            }}
          >
            <option value="">—</option>
            {listaContactos.map((c) => (
              <option key={c.id} value={c.id}>{`${c.nombre}${c.apellidos ? ` ${c.apellidos}` : ''}`}</option>
            ))}
            {/* La persona con la que se queda a veces no está dada de alta
                todavía; se escribe aquí solo para el seguimiento. */}
            <option value={OTRO}>Otro (escribir nombre)…</option>
          </select>
        </label>
        {escribiendo && (
          <label>
            Nombre del contacto
            <input
              className="input-dato"
              value={contactoLibre}
              onChange={(e) => setContactoLibre(e.target.value)}
              placeholder="Quién te atiende"
              maxLength={120}
            />
          </label>
        )}
        <label>
          Modalidad
          <select className="input-dato" value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
            {MODALIDADES_REUNION.map((m) => (
              <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
            ))}
          </select>
        </label>
        {modalidad === 'otros' && (
          <label>
            ¿Cuál?
            <input
              className="input-dato"
              value={modalidadOtro}
              onChange={(e) => setModalidadOtro(e.target.value)}
              placeholder="Feria, visita a obra…"
            />
          </label>
        )}
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
        <button className="btn" type="submit" disabled={cargando || faltanDatos}>
          {cargando ? 'Agendando…' : 'Agendar'}
        </button>
        {estado && (
          <span style={{ fontSize: 12, color: estado.tipo === 'error' ? 'var(--rojo)' : 'var(--muted)' }}>
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
