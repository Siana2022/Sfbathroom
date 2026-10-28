'use client';
import { useState } from 'react';
import FormContacto from '@/components/FormContacto';
import type { Contacto } from '@/lib/comercial/tipos';

type Props = {
  clienteId: string;
  empresaCodigo: string;
  contactos: Contacto[];
};

/** Listado de contactos con alta y edición en línea. */
export default function ListaContactos({ clienteId, empresaCodigo, contactos }: Props) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

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

      {creando && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--borde, #e5e5e5)' }}>
          <FormContacto clienteId={clienteId} empresaCodigo={empresaCodigo} onCerrar={() => setCreando(false)} />
        </div>
      )}

      {contactos.length === 0 && !creando ? (
        <p style={{ color: 'var(--muted)' }}>Sin contactos registrados para este cliente.</p>
      ) : (
        <ul className="tablas" style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
          {contactos.map((c) => (
            <li key={c.id} style={{ padding: '8px 0', borderTop: '1px solid var(--borde, #e5e5e5)' }}>
              {editando === c.id ? (
                <FormContacto clienteId={clienteId} empresaCodigo={empresaCodigo} contacto={c} onCerrar={() => setEditando(null)} />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{c.nombre}{c.apellidos ? ` ${c.apellidos}` : ''}</strong>
                    {c.cargo && <span style={{ color: 'var(--muted)' }}> · {c.cargo}</span>}
                    <br />
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {[c.email, c.telefono, c.movil].filter(Boolean).join(' · ') || 'sin datos de contacto'}
                      {c.pais || c.provincia ? ` · ${[c.provincia, c.pais].filter(Boolean).join(', ')}` : ''}
                    </span>
                    {c.notas && <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{c.notas}</div>}
                  </div>
                  <button className="btn" type="button" onClick={() => { setEditando(c.id); setCreando(false); }}>
                    Editar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
