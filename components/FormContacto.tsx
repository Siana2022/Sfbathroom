'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contacto } from '@/lib/comercial/tipos';

type Props = {
  clienteId: string;
  empresaCodigo: string;
  contacto?: Contacto;
  onCerrar?: () => void;
};

const VACIO = {
  nombre: '',
  apellidos: '',
  cargo: '',
  email: '',
  telefono: '',
  movil: '',
  pais: '',
  provincia: '',
  idioma: '',
  notas: '',
};

/** Alta y edición de contactos. País/provincia alimentan los envíos masivos. */
export default function FormContacto({ clienteId, empresaCodigo, contacto, onCerrar }: Props) {
  const router = useRouter();
  const [datos, setDatos] = useState({
    ...VACIO,
    ...(contacto
      ? Object.fromEntries(Object.entries(contacto).map(([k, v]) => [k, v ?? '']))
      : {}),
  });
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  function set(campo: string, valor: string) {
    setEstado(null);
    setDatos((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setEstado(null);
    try {
      const url = contacto ? `/api/comercial/contactos/${contacto.id}` : '/api/comercial/contactos';
      const res = await fetch(url, {
        method: contacto ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...datos, cliente_id: clienteId, empresa_codigo: empresaCodigo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar.');
      setEstado({ tipo: 'ok', mensaje: contacto ? 'Contacto actualizado.' : 'Contacto creado.' });
      if (!contacto) setDatos({ ...VACIO });
      router.refresh();
      onCerrar?.();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'Error al guardar.' });
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label>
          Nombre *
          <input className="input-dato" value={datos.nombre} onChange={(e) => set('nombre', e.target.value)} required />
        </label>
        <label>
          Apellidos
          <input className="input-dato" value={datos.apellidos} onChange={(e) => set('apellidos', e.target.value)} />
        </label>
        <label>
          Cargo
          <input className="input-dato" value={datos.cargo} onChange={(e) => set('cargo', e.target.value)} />
        </label>
        <label>
          Email
          <input className="input-dato" type="email" value={datos.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label>
          Teléfono
          <input className="input-dato" value={datos.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </label>
        <label>
          Móvil
          <input className="input-dato" value={datos.movil} onChange={(e) => set('movil', e.target.value)} />
        </label>
        <label>
          País
          <input className="input-dato" value={datos.pais} onChange={(e) => set('pais', e.target.value)} />
        </label>
        <label>
          Provincia
          <input className="input-dato" value={datos.provincia} onChange={(e) => set('provincia', e.target.value)} />
        </label>
        <label>
          Idioma
          <input className="input-dato" value={datos.idioma} onChange={(e) => set('idioma', e.target.value)} />
        </label>
      </div>
      <label>
        Notas
        <textarea className="input-dato" rows={2} value={datos.notas} onChange={(e) => set('notas', e.target.value)} />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" type="submit" disabled={cargando}>
          {cargando ? 'Guardando…' : contacto ? 'Guardar cambios' : 'Añadir contacto'}
        </button>
        {onCerrar && (
          <button className="btn" type="button" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </button>
        )}
        {estado && (
          <span style={{ fontSize: 12, color: estado.tipo === 'error' ? 'var(--error, darkred)' : 'var(--muted)' }}>
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
