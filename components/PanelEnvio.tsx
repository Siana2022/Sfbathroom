'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Comercial = { id: string; nombre: string };

export default function PanelEnvio({
  campanaId,
  empresaId,
  comerciales,
  segmentoInicial,
  estadoCampana,
}: {
  campanaId: string;
  empresaId: string;
  comerciales: Comercial[];
  segmentoInicial: Record<string, unknown>;
  estadoCampana: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [seleccion, setSeleccion] = useState<string[]>(
    Array.isArray(segmentoInicial.comerciales) ? (segmentoInicial.comerciales as string[]) : [],
  );
  const [estado, setEstado] = useState(String(segmentoInicial.estado ?? 'todos'));
  const [provincia, setProvincia] = useState(String(segmentoInicial.provincia ?? ''));
  const [prueba, setPrueba] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const segmento = useMemo(
    () => ({
      comerciales: seleccion,
      estado,
      provincia: provincia.trim() || null,
    }),
    [seleccion, estado, provincia],
  );

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

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <label className="campo-filtro">
          Estado del cliente
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </label>
        <label className="campo-filtro" style={{ minWidth: 200 }}>
          Provincia (contiene)
          <input type="text" value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Madrid" />
        </label>
      </div>

      <details style={{ marginBottom: 10 }}>
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
