'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Comercial = { id: string; nombre: string };
type ClienteMini = { id: string; nombre: string; email: string | null };

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
  const [resultados, setResultados] = useState<ClienteMini[]>([]);
  const [elegidos, setElegidos] = useState<ClienteMini[]>([]);
  const [prueba, setPrueba] = useState('');
  const [fecha, setFecha] = useState('');
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
      const q = supabase.from('clientes').select('id, nombre, email').order('nombre').limit(40);
      const filtrada = busqueda.trim() ? q.ilike('nombre', `%${busqueda.trim()}%`) : q;
      filtrada.then(({ data }) => {
        if (cancelado) return;
        setResultados((data ?? []) as ClienteMini[]);
      });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [modo, busqueda]);

  function alternarCliente(c: ClienteMini) {
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

  function programar() {
    if (!fecha) {
      setError('Elige fecha y hora de envío.');
      return;
    }
    setError(null);
    setMensaje(null);
    startTransition(async () => {
      const res = await fetch('/api/marketing/programar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campanaId, fecha, segmento }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? 'No se pudo programar.');
      else {
        setMensaje(`Campaña programada para ${new Date(fecha).toLocaleString('es-ES')}.`);
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

  const totalElegidos = elegidos.length;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>¿A quién se envía?</h2>
        <span style={{ fontSize: 12, color: 'var(--tenue)' }}>Las bajas se excluyen automáticamente</span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 14px' }}>
        Se usará el email del cliente y el de sus contactos.
      </p>

      <div className="modo-opciones">
        <button
          type="button"
          className={`modo-opcion${modo === 'todos' ? ' activa' : ''}`}
          onClick={() => setModo('todos')}
        >
          <strong>Todos mis clientes</strong>
          <span>Con filtros de estado y provincia</span>
        </button>
        <button
          type="button"
          className={`modo-opcion${modo === 'elegir' ? ' activa' : ''}`}
          onClick={() => setModo('elegir')}
        >
          <strong>Elegir clientes</strong>
          <span>Marca uno a uno a quién escribir</span>
        </button>
      </div>

      {modo === 'todos' ? (
        <div className="segmento-filtros">
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
          {!esComercial ? (
            <details style={{ gridColumn: '1 / -1' }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                Comerciales ({seleccion.length} seleccionados)
              </summary>
              <div className="lista-check">
                {comerciales.map((c) => (
                  <label key={c.id}>
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
          ) : (
            <p style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Se enviará solo a <strong>tu cartera</strong>, según el estado y la provincia que elijas.
            </p>
          )}
        </div>
      ) : (
        <div className="segmento-filtros">
          <label className="campo-editor" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
            <span>Buscar cliente</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escribe el nombre…"
            />
          </label>
          <div className="lista-check" style={{ gridColumn: '1 / -1', maxHeight: 220, overflowY: 'auto' }}>
            {resultados.length === 0 ? (
              <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13 }}>Sin resultados.</p>
            ) : (
              resultados.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={elegidos.some((x) => x.id === c.id)} onChange={() => alternarCliente(c)} />
                  <span style={{ flex: 1 }}>{c.nombre}</span>
                  <span style={{ fontSize: 12, color: c.email ? 'var(--muted)' : 'var(--ambar)' }}>
                    {c.email ?? 'sin email'}
                  </span>
                </label>
              ))
            )}
          </div>
          {elegidos.length > 0 ? (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
          <p style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            {totalElegidos} clientes seleccionados.
          </p>
        </div>
      )}

      <div className="acciones-envio">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="boton" onClick={guardarSegmento} disabled={pending}>
            Guardar segmento
          </button>
          <label className="campo-editor" style={{ marginBottom: 0, minWidth: 240 }}>
            <span>Email de prueba</span>
            <input type="email" value={prueba} onChange={(e) => setPrueba(e.target.value)} placeholder="tu@sfbathroom.com" />
          </label>
          <button type="button" className="boton" onClick={() => enviar(true)} disabled={pending || !prueba.includes('@')}>
            Enviar prueba
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="campo-editor" style={{ marginBottom: 0, minWidth: 210 }}>
            <span>Programar para</span>
            <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <button type="button" className="boton" onClick={programar} disabled={pending || !fecha}>
            Programar
          </button>
          <button
            type="button"
            className="boton boton-primario"
            onClick={() => enviar(false)}
            disabled={pending || estadoCampana === 'enviando'}
          >
            {pending ? 'Enviando…' : 'Enviar ahora'}
          </button>
        </div>
      </div>

      {mensaje ? <p className="nota">{mensaje}</p> : null}
      {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
    </div>
  );
}
