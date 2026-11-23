'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Usuario = { id: string; email: string | null; rol: string | null; comercial_id: string | null; created_at: string | null };
type Comercial = { id: string; nombre: string };

const ROLES = ['admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen', 'comercial'];

export default function AdminUsuarios({ usuarios, comerciales }: { usuarios: Usuario[]; comerciales: Comercial[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('comercial');
  const [comercialId, setComercialId] = useState('');

  const [edicion, setEdicion] = useState<Record<string, { rol: string; comercialId: string }>>({});

  function crear() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre, password, rol, comercialId: comercialId || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? 'No se pudo crear.');
      else {
        setOk(`Usuario ${email} creado.`);
        setEmail('');
        setNombre('');
        setPassword('');
        router.refresh();
      }
    });
  }

  function guardar(u: Usuario) {
    const e = edicion[u.id] ?? { rol: u.rol ?? 'lectura', comercialId: u.comercial_id ?? '' };
    startTransition(async () => {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, rol: e.rol, comercialId: e.comercialId || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? 'No se pudo guardar.');
      else {
        setOk('Usuario actualizado.');
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="card">
        <h2>Crear usuario</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          El usuario se crea ya confirmado, con la contraseña que indiques. Asígnalo a un comercial
          de A3ERP para que vea su cartera.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="campo-filtro" style={{ minWidth: 220 }}>
            Email *
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="campo-filtro" style={{ minWidth: 180 }}>
            Nombre
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="campo-filtro">
            Contraseña *
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 8" />
          </label>
          <label className="campo-filtro">
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="campo-filtro" style={{ minWidth: 260 }}>
            Comercial (A3ERP)
            <select value={comercialId} onChange={(e) => setComercialId(e.target.value)}>
              <option value="">— Sin cartera —</option>
              {comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
        {ok ? <p className="nota">{ok}</p> : null}
        <div style={{ marginTop: 10 }}>
          <button type="button" className="boton" onClick={crear} disabled={pending || !email.includes('@') || password.length < 8}>
            {pending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Usuarios ({usuarios.length})</h2>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Email</th>
                <th>Rol</th>
                <th>Comercial</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const e = edicion[u.id] ?? { rol: u.rol ?? 'lectura', comercialId: u.comercial_id ?? '' };
                return (
                  <tr key={u.id}>
                    <td>{u.email ?? '—'}</td>
                    <td>
                      <select
                        value={e.rol}
                        onChange={(ev) => setEdicion({ ...edicion, [u.id]: { ...e, rol: ev.target.value } })}
                        style={{ padding: '5px 8px', border: '1px solid var(--border-2)', borderRadius: 8 }}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={e.comercialId}
                        onChange={(ev) => setEdicion({ ...edicion, [u.id]: { ...e, comercialId: ev.target.value } })}
                        style={{ padding: '5px 8px', border: '1px solid var(--border-2)', borderRadius: 8, maxWidth: 280 }}
                      >
                        <option value="">— Sin cartera —</option>
                        {comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="boton" onClick={() => guardar(u)} disabled={pending}>
                        Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
