'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AlertaCliente, EventoSeguimiento } from '@/lib/datos/seguimiento';

const ICONO: Record<EventoSeguimiento['tipo'], string> = {
  nota: '📝',
  reunion: '🤝',
  cambio: '🔁',
  alta: '•',
  interaccion: '📞',
};

/** Icono según el subtipo de la interacción importada. */
const ICONO_INTERACCION: Record<string, string> = {
  llamada: '📞',
  nota: '🗒️',
  correo: '✉️',
  tarea: '✅',
};

function recortar(texto: string | null, max = 400): string | null {
  if (!texto) return null;
  const limpio = texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

function fecha(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PanelSeguimiento({
  clienteId,
  empresaId,
  eventos,
  alertas,
}: {
  clienteId: string;
  empresaId: string;
  eventos: EventoSeguimiento[];
  alertas: AlertaCliente[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nota, setNota] = useState('');
  const [titulo, setTitulo] = useState('');
  const [recordar, setRecordar] = useState('');
  const [error, setError] = useState<string | null>(null);

  function guardarNota() {
    if (!nota.trim()) return;
    startTransition(async () => {
      const { error: e } = await supabase
        .from('clientes_notas')
        .insert({ empresa_id: empresaId, cliente_id: clienteId, texto: nota.trim() });
      if (e) setError(e.message);
      else {
        setNota('');
        router.refresh();
      }
    });
  }

  function crearAlerta() {
    if (!titulo.trim()) return;
    startTransition(async () => {
      const { error: e } = await supabase.from('clientes_alertas').insert({
        empresa_id: empresaId,
        cliente_id: clienteId,
        titulo: titulo.trim(),
        recordar_hasta: recordar || null,
      });
      if (e) setError(e.message);
      else {
        setTitulo('');
        setRecordar('');
        router.refresh();
      }
    });
  }

  function resolver(id: string) {
    startTransition(async () => {
      const { error: e } = await supabase.from('clientes_alertas').update({ resuelta: true }).eq('id', id);
      if (e) setError(e.message);
      else router.refresh();
    });
  }

  function recordarEn(id: string, dias: number) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    startTransition(async () => {
      const { error: e } = await supabase
        .from('clientes_alertas')
        .update({ recordar_hasta: d.toISOString().slice(0, 10), resuelta: false })
        .eq('id', id);
      if (e) setError(e.message);
      else router.refresh();
    });
  }

  return (
    <div className="card" id="seguimiento">
      <h2>Seguimiento</h2>

      {alertas.filter((a) => !a.resuelta).length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          {alertas
            .filter((a) => !a.resuelta)
            .map((a) => (
              <div
                key={a.id}
                style={{
                  border: '1px solid var(--border-2)',
                  borderLeft: '3px solid var(--ambar)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 8,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>{a.titulo}</strong>
                  {a.recordarHasta ? (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}> · recordar {a.recordarHasta}</span>
                  ) : null}
                </div>
                <button type="button" className="boton" onClick={() => recordarEn(a.id, 7)} disabled={pending}>+7 días</button>
                <button type="button" className="boton" onClick={() => recordarEn(a.id, 30)} disabled={pending}>+30 días</button>
                <button type="button" className="boton" onClick={() => resolver(a.id)} disabled={pending}>Resuelta</button>
              </div>
            ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <label className="campo-editor" style={{ flex: 1, minWidth: 240, marginBottom: 0 }}>
          <span>Nueva nota interna</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Lo que hablaste, lo que prometiste, lo que te dijeron…"
            style={{ minHeight: 70, width: '100%' }}
          />
        </label>
        <button type="button" className="boton boton-primario" onClick={guardarNota} disabled={pending || !nota.trim()}>
          Añadir nota
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label className="campo-editor" style={{ minWidth: 220, marginBottom: 0 }}>
          <span>Aviso para este cliente</span>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Llamar por la oferta de junio" />
        </label>
        <label className="campo-editor" style={{ minWidth: 160, marginBottom: 0 }}>
          <span>Recordar el</span>
          <input type="date" value={recordar} onChange={(e) => setRecordar(e.target.value)} />
        </label>
        <button type="button" className="boton" onClick={crearAlerta} disabled={pending || !titulo.trim()}>
          Crear aviso
        </button>
      </div>

      {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}

      <h3 style={{ marginBottom: 8 }}>Historial</h3>
      {eventos.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Todavía no hay actividad registrada.</p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {eventos.map((e) => (
            <li key={`${e.tipo}-${e.id}`} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span aria-hidden="true" style={{ width: 22 }}>
                {e.tipo === 'interaccion' ? ICONO_INTERACCION[e.subtipo] ?? '📞' : ICONO[e.tipo]}
              </span>
              <span style={{ width: 92, color: 'var(--muted)', fontSize: 13, flexShrink: 0 }}>{fecha(e.fecha)}</span>
              <span style={{ flex: 1, fontSize: 14 }}>
                {e.tipo === 'nota' ? e.texto : null}
                {e.tipo === 'reunion' ? (
                  <>
                    <strong>{e.titulo}</strong>
                    {e.estado ? <span className="badge listo" style={{ marginLeft: 8 }}>{e.estado}</span> : null}
                    {e.contacto ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {e.contacto}</span> : null}
                  </>
                ) : null}
                {e.tipo === 'cambio' ? (
                  <>
                    {e.texto}
                    {e.motivo ? <span style={{ color: 'var(--muted)' }}> · {e.motivo}</span> : null}
                  </>
                ) : null}
                {e.tipo === 'alta' ? e.texto : null}
                {e.tipo === 'interaccion' ? (
                  <>
                    <strong>{e.titulo ?? (e.subtipo === 'llamada' ? 'Llamada' : 'Interacción')}</strong>
                    {e.resultado ? (
                      <span className="badge listo" style={{ marginLeft: 8 }}>{e.resultado}</span>
                    ) : null}
                    {e.duracionSeg ? (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {Math.round(e.duracionSeg / 60)} min</span>
                    ) : null}
                    {e.origen && e.origen !== 'manual' ? (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {e.origen}</span>
                    ) : null}
                    {recortar(e.detalle) ? (
                      <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{recortar(e.detalle)}</div>
                    ) : null}
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
