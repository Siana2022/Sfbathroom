'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Notificacion = {
  id: string; tipo: string; titulo: string; mensaje: string | null; enlace: string | null;
  leida: boolean; fecha: string;
};

export default function CampanaNotificaciones() {
  const router = useRouter();
  const [noLeidas, setNoLeidas] = useState(0);
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function cargar() {
    try {
      const res = await fetch('/api/notificaciones', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const notifs: Notificacion[] = data.notificaciones ?? [];
      setLista(notifs);
      setNoLeidas(notifs.filter((n) => !n.leida).length);
    } catch { /* noop */ }
  }

  useEffect(() => { cargar(); }, [abierto]);
  useEffect(() => {
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function cerrar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    if (abierto) document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  async function marcarTodas() {
    await fetch('/api/notificaciones', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ todas: true }) });
    await cargar();
    setAbierto(false);
  }

  async function marcarUna(id: string, enlace: string | null) {
    await fetch('/api/notificaciones', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
    if (enlace) router.push(enlace);
    await cargar();
    setAbierto(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-label="Notificaciones"
        title="Notificaciones"
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 18, color: 'var(--text)' }}
      >
        &#128276;
        {noLeidas > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, background: 'var(--rojo)', color: '#fff',
            fontSize: 10, fontWeight: 700, borderRadius: 99, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
          }}>
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 320, maxHeight: 360,
          overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 50, padding: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 13 }}>Notificaciones</strong>
            {noLeidas > 0 && (
              <button type="button" onClick={marcarTodas}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>
                Marcar todo leído
              </button>
            )}
          </div>
          {lista.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 12, padding: 16, textAlign: 'center' }}>Sin notificaciones.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {lista.slice(0, 20).map((n) => (
                <li key={n.id} style={{ borderBottom: '1px solid var(--border)', background: n.leida ? 'transparent' : 'rgba(var(--accent-rgb), 0.04)' }}>
                  <button
                    type="button"
                    onClick={() => marcarUna(n.id, n.enlace)}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '8px 12px', display: 'block',
                      fontFamily: 'inherit', fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>
                      {!n.leida && <span style={{ color: 'var(--accent)', marginRight: 6 }}>&#9679;</span>}
                      {n.titulo}
                    </span>
                    {n.mensaje && <span style={{ color: 'var(--muted)' }}>{n.mensaje}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}