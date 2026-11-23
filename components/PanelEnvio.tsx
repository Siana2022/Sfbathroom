'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Comercial = { id: string; nombre: string };

export default function PanelEnvio({
  campanaId,
  empresaId,
  comerciales,
  segmentoInicial,
  estadoCampana,
  esComercial = false,
}: {
  campanaId: string;
  empresaId: string;
  comerciales: Comercial[];
  segmentoInicial: Record<string, unknown>;
  estadoCampana: string;
  esComercial?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [seleccion, setSeleccion] = useState<string[]>(
    Array.isArray(segmentoInicial.comerciales) ? (segmentoInicial.comerciales as string[]) : [],
  );
  const [estado, setEstado] = useState(String(segmentoInicial.estado ?? 'todos'));
  const [provincia, setProvincia] = useState(String(segmentoInicial.provincia ?? ''));
  const [modo, setModo] = useState<'todos' | 'elegir'>(
    Array.isArray(segmentoInicial.clientes) && (segmentoInicial.clientes as string[]).length > 0 ? 'elegir' : 'todos',
  );
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<{ id: string; nombre: string; email: string | null }[]>([]);
  const [elegidos, setElegidos] = useState<{ id: string; nombre: string; email: string | null }[]>([]);
  const [prueba, setPrueba] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const segmento = useMemo(
    () => ({
      modo,
      comerciales: seleccion,
      estado,
      provincia: provincia.trim() || null,
      clientes: modo === 'elegir' ? elegidos.map((c) => c.id) : [],
    }),
    [modo, seleccion, estado, provincia, elegidos],
  );

  useEffect(() => {
    if (modo !== 'elegir') return;
    let cancelado = false;
    const t = setTimeout(() => {
      const q = supabase
        .from('clientes')
        .select('id, nombre, email')
        .order('nombre')
        .limit(40);
      const filtrada = busqueda.trim() ? q.ilike('nombre', `%${busqueda.trim()}%`) : q;
      filtrada.then(({ data }) => {
        if (cancelado) return;
        setResultados((data ?? []) as { id: string; nombre: string; email: string | null }[]);
      });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [modo, busqueda]);

  function alternarCliente(c: { id: string; nombre: string; email: string | null }) {
    setElegidos((prev) => (prev.some((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c]));
  }

  function guardarSegmento() {
    startTransition(async () => {
      const { error: e } = await supabase.from('campanas_email').update({ segmento }).eq('id', campanaId);
      if (e) setError(e.message);
      else {
        setMensaje('Segmento guardado.');
        router.refresh();
      }
    });
  }

  function enviar(esPrueba: boolean) {
    setError(null);
    setMensaje(null);
    if (!esPrueba && !window.confirm('¿Enviar la campaña a todos los destinatarios del segmento?')) return;

    startTransition(async () => {
      const res = await fetch('/api/marketing/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campanaId,
          segmento,
          prueba: esPrueba ? prueba.trim() : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; enviados?: number; fallidos?: number };
      if (!res.ok) setError(data.error ?? 'No se pudo enviar.');
      else {
        setMensaje(esPrueba ? 'Prueba enviada.' : `Enviados ${data.enviados ?? 0} · fallidos ${data.fallidos ?? 0}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <h2>Segmento y envío</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Se enviará a los clientes que tengan email en su ficha o en sus contactos. Las bajas se excluyen automáticamente.
      </p>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <input type="radio" name="modo" checked={modo === 'todos'} onChange={() => setModo('todos')} />
          Todos mis clientes
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <input type="radio" name="modo" checked={modo === 'elegir'} onChange={() => setModo('elegir')} />
          Elegir clientes
        </label>
      </div>

      {modo === 'elegir' ? (
        <div style={{ marginBottom: 12 }}>
          <label className="campo-editor">
            <span>Buscar cliente</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre del cliente…"
            />
          </label>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-2)', borderRadius: 10, padding: 8 }}>
            {resultados.length === 0 ? (
              <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13 }}>Sin resultados.</p>
            ) : (
              resultados.map((c) => (
                <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
                  <input type="checkbox" checked={elegidos.some((x) => x.id === c.id)} onChange={() => alternarCliente(c)} />
                  <span style={{ flex: 1 }}>{c.nombre}</span>
                  <span style={{ color: c.email ? 'var(--muted)' : 'var(--ambar)', fontSize: 12 }}>
                    {c.email ?? 'sin email'}
                  </span>
                </label>
              ))
            )}
          </div>
          {elegidos.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {elegidos.map((c) => (
                <span key={c.id} className="badge listo" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {c.nombre}
                  <button
                    type="button"
                    onClick={() => setElegidos(elegidos.filter((x) => x.id !== c.id))}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit' }}
                    aria-label={`Quitar ${c.nombre}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
            {elegidos.length} clientes seleccionados.
          </p>
        </div>
      ) : null}
      <div className="fila-filtros" style={{ marginBottom: 12, opacity: modo === 'elegir' ? 0.45 : 1 }}>
        <label className="campo-editor" style={{ marginBottom: 0 }}>
          <span>Estado del cliente</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </label>
        <label className="campo-editor" style={{ marginBottom: 0 }}>
          <span>Provincia (contiene)</span>
          <input type="text" value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Madrid" />
        </label>
      </div>

      {esComercial ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Se enviará solo a <strong>tus clientes</strong>, según el estado y la provincia que elijas.
        </p>
      ) : null}
      <details style={{ marginBottom: 10, display: esComercial ? 'none' : undefined }}>
        <summary style={{ cursor: 'pointer' }}>Comerciales ({seleccion.length} seleccionados)</summary>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-2)', borderRadius: 8, padding: 8, marginTop: 6 }}>
          {comerciales.map((c) => (
            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '2px 0' }}>
              <input
                type="checkbox"
                checked={seleccion.includes(c.id)}
                onChange={() =>
                  setSeleccion(seleccion.includes(c.id) ? seleccion.filter((x) => x !== c.id) : [...seleccion, c.id])
                }
              />
              {c.nombre}
            </label>
          ))}
        </div>
      </details>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <button type="button" className="boton" onClick={guardarSegmento} disabled={pending}>Guardar segmento</button>
        <label className="campo-filtro" style={{ minWidth: 240 }}>
          Email de prueba
          <input type="email" value={prueba} onChange={(e) => setPrueba(e.target.value)} placeholder="tu@sfbathroom.com" />
        </label>
        <button type="button" className="boton" onClick={() => enviar(true)} disabled={pending || !prueba.includes('@')}>
          Enviar prueba
        </button>
        <button type="button" className="boton" onClick={() => enviar(false)} disabled={pending || estadoCampana === 'enviando'}>
          Enviar campaña
        </button>
      </div>

      {mensaje ? <p className="nota">{mensaje}</p> : null}
      {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
    </div>
  );
}
