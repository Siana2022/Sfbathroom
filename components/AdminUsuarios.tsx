'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Usuario = { id: string; email: string | null; rol: string | null; comercial_id: string | null; created_at: string | null };
type Comercial = { id: string; nombre: string };

const ROLES = ['admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen', 'comercial'];

function SelectorComerciales({
  comerciales,
  seleccion,
  onCambio,
}: {
  comerciales: Comercial[];
  seleccion: string[];
  onCambio: (ids: string[]) => void;
}) {
  const [filtro, setFiltro] = useState('');
  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? comerciales.filter((c) => c.nombre.toLowerCase().includes(q)) : comerciales;
  }, [comerciales, filtro]);

  const alternar = (id: string) => {
    onCambio(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);
  };

  const todosVisibles = visibles.every((c) => seleccion.includes(c.id));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar comercial…"
          style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 8 }}
        />
        <button
          type="button"
          className="boton"
          onClick={() => {
            const ids = visibles.map((c) => c.id);
            onCambio(todosVisibles ? seleccion.filter((x) => !ids.includes(x)) : [...new Set([...seleccion, ...ids])]);
          }}
        >
          {todosVisibles ? 'Quitar visibles' : 'Todos los visibles'}
        </button>
      </div>
      <div style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid var(--border-2)', borderRadius: 8, padding: 8 }}>
        {visibles.map((c) => (
          <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
            <input type="checkbox" checked={seleccion.includes(c.id)} onChange={() => alternar(c.id)} />
            {c.nombre}
          </label>
        ))}
        {visibles.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>Sin resultados.</p> : null}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{seleccion.length} seleccionados</div>
    </div>
  );
}

export default function AdminUsuarios({
  usuarios,
  comerciales,
  asignaciones,
}: {
  usuarios: Usuario[];
  comerciales: Comercial[];
  asignaciones: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('comercial');
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const [editando, setEditando] = useState<{ usuario: Usuario; ids: string[] } | null>(null);

  function crear() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre, password, rol, comercialIds: seleccion }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? 'No se pudo crear.');
      else {
        setOk(`Usuario ${email} creado.`);
        setEmail('');
        setNombre('');
        setPassword('');
        setSeleccion([]);
        router.refresh();
      }
    });
  }

  function guardarCarteras() {
    if (!editando) return;
    startTransition(async () => {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editando.usuario.id, rol: editando.usuario.rol, comercialIds: editando.ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? 'No se pudo guardar.');
      else {
        setOk('Carteras actualizadas.');
        setEditando(null);
        router.refresh();
      }
    });
  }

  function guardarRol(u: Usuario, nuevoRol: string) {
    startTransition(async () => {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, rol: nuevoRol, comercialIds: asignaciones[u.id] ?? [] }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? 'No se pudo guardar.');
      else {
        setOk('Rol actualizado.');
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="card">
        <h2>Crear usuario</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          El usuario se crea confirmado con la contraseña que indiques. Marca **todos** los
          comerciales de A3ERP que le correspondan (puede tener varios).
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
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
        </div>
        <SelectorComerciales comerciales={comerciales} seleccion={seleccion} onCambio={setSeleccion} />
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
        <table className="tabla">
          <thead>
            <tr>
              <th>Email</th>
              <th>Rol</th>
              <th>Carteras</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const ids = asignaciones[u.id] ?? [];
              return (
                <tr key={u.id}>
                  <td>{u.email ?? '—'}</td>
                  <td>
                    <select
                      defaultValue={u.rol ?? 'lectura'}
                      onChange={(e) => guardarRol(u, e.target.value)}
                      style={{ padding: '5px 8px', border: '1px solid var(--border-2)', borderRadius: 8 }}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{ids.length} comerciales</td>
                  <td>
                    <button type="button" className="boton" onClick={() => setEditando({ usuario: u, ids })}>
                      Editar carteras
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando ? (
        <div className="modal-fondo" onClick={() => setEditando(null)} role="dialog" aria-modal="true">
          <div className="modal-caja modal-ancho" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>Carteras de {editando.usuario.email}</h3>
                <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
                  Marca todos los comerciales de A3ERP que gestiona.
                </p>
              </div>
              <button type="button" className="modal-cerrar" onClick={() => setEditando(null)} aria-label="Cerrar">✕</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <SelectorComerciales
                comerciales={comerciales}
                seleccion={editando.ids}
                onCambio={(ids) => setEditando({ ...editando, ids })}
              />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className="boton" onClick={guardarCarteras} disabled={pending}>
                Guardar
              </button>
              <button type="button" className="boton" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
