'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import FormContacto from '@/components/FormContacto';
import type { Contacto } from '@/lib/comercial/tipos';

type Props = {
  clienteId: string;
  empresaCodigo: string;
  contactos: Contacto[];
  /** Contacto marcado como persona habitual en la ficha, si lo hay. */
  contactoHabitualId: string | null;
  /** Sin permiso de escritura no se ofrece marcar la persona habitual. */
  editable: boolean;
};

/** Listado de contactos con alta, edición en línea y persona habitual. */
export default function ListaContactos({ clienteId, empresaCodigo, contactos, contactoHabitualId, editable }: Props) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardandoHabitual, setGuardandoHabitual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarHabitual(contactoId: string | null) {
    setGuardandoHabitual(true);
    setError(null);
    try {
      const res = await fetch(`/api/comercial/clientes/${clienteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacto_habitual_id: contactoId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar la persona habitual.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setGuardandoHabitual(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Contactos</h2>
        {!creando && (
          <button className="btn" type="button" onClick={() => { setCreando(true); setEditando(null); }}>
            Añadir contacto
          </button>
        )}
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
        La persona habitual es la que se muestra en la cartera, para saber a quién llamar sin abrir la ficha.
      </p>

      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error}</p>}

      {creando && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--borde, #e5e5e5)' }}>
          <FormContacto clienteId={clienteId} empresaCodigo={empresaCodigo} onCerrar={() => setCreando(false)} />
        </div>
      )}

      {contactos.length === 0 && !creando ? (
        <p style={{ color: 'var(--muted)' }}>Sin contactos registrados para este cliente.</p>
      ) : (
        <ul className="tablas" style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
          {contactos.map((c) => {
            const esHabitual = c.id === contactoHabitualId;
            return (
              <li key={c.id} style={{ padding: '8px 0', borderTop: '1px solid var(--borde, #e5e5e5)' }}>
                {editando === c.id ? (
                  <FormContacto clienteId={clienteId} empresaCodigo={empresaCodigo} contacto={c} onCerrar={() => setEditando(null)} />
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{c.nombre}{c.apellidos ? ` ${c.apellidos}` : ''}</strong>
                      {esHabitual && <span className="badge listo" style={{ marginLeft: 8 }}>Persona habitual</span>}
                      {c.cargo && <span style={{ color: 'var(--muted)' }}> · {c.cargo}</span>}
                      <br />
                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {[c.email, c.telefono, c.movil].filter(Boolean).join(' · ') || 'sin datos de contacto'}
                        {c.pais || c.provincia ? ` · ${[c.provincia, c.pais].filter(Boolean).join(', ')}` : ''}
                      </span>
                      {c.notas && <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{c.notas}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      {editable && !esHabitual && (
                        <button className="btn" type="button" disabled={guardandoHabitual} onClick={() => marcarHabitual(c.id)}>
                          Marcar habitual
                        </button>
                      )}
                      {editable && esHabitual && (
                        <button className="btn" type="button" disabled={guardandoHabitual} onClick={() => marcarHabitual(null)}>
                          Quitar habitual
                        </button>
                      )}
                      <button className="btn" type="button" onClick={() => { setEditando(c.id); setCreando(false); }}>
                        Editar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
