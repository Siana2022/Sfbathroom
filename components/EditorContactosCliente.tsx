'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ContactoCliente } from '@/lib/datos/contactos';

export default function EditorContactosCliente({
  clienteId,
  empresaId,
  contactos,
}: {
  clienteId: string;
  empresaId: string;
  contactos: ContactoCliente[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [principal, setPrincipal] = useState(contactos.length === 0);

  function añadir() {
    if (!nombre.trim()) return;
    setError(null);
    startTransition(async () => {
      const { error: e } = await supabase.from('clientes_contactos').insert({
        empresa_id: empresaId,
        cliente_id: clienteId,
        nombre: nombre.trim(),
        cargo: cargo.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        es_principal: principal,
      });
      if (e) setError(e.message);
      else {
        setNombre('');
        setCargo('');
        setTelefono('');
        setEmail('');
        setPrincipal(false);
        router.refresh();
      }
    });
  }

  async function marcarPrincipal(id: string) {
    startTransition(async () => {
      await supabase.from('clientes_contactos').update({ es_principal: false }).eq('cliente_id', clienteId);
      const { error: e } = await supabase.from('clientes_contactos').update({ es_principal: true }).eq('id', id);
      if (e) setError(e.message);
      else router.refresh();
    });
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar este contacto?')) return;
    startTransition(async () => {
      const { error: e } = await supabase.from('clientes_contactos').delete().eq('id', id);
      if (e) setError(e.message);
      else router.refresh();
    });
  }

  return (
    <div className="card">
      <h2>Contactos del cliente</h2>

      {contactos.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Sin contactos. Añade el primero abajo.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cargo</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {contactos.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.nombre} {c.esPrincipal ? <span className="badge listo">Principal</span> : null}
                </td>
                <td>{c.cargo ?? '—'}</td>
                <td>{c.telefono ?? '—'}</td>
                <td>{c.email ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!c.esPrincipal ? (
                    <button type="button" className="boton" onClick={() => marcarPrincipal(c.id)} disabled={pending}>
                      Hacer principal
                    </button>
                  ) : null}{' '}
                  <button type="button" className="boton" onClick={() => borrar(c.id)} disabled={pending}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 18 }}>Añadir contacto</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="campo-filtro" style={{ minWidth: 200 }}>
          Nombre *
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="campo-filtro">
          Cargo
          <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        </label>
        <label className="campo-filtro">
          Teléfono
          <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
        <label className="campo-filtro" style={{ minWidth: 220 }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />
          Principal
        </label>
      </div>
      {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="boton" onClick={añadir} disabled={pending || !nombre.trim()}>
          {pending ? 'Guardando…' : 'Añadir contacto'}
        </button>
      </div>
    </div>
  );
}
