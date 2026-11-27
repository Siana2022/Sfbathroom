'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Observación sobre un pedido (por qué va tarde, incidencia, …).
 * Guarda histórico en `pedidos_observaciones`.
 */
export default function ObservacionPedido({
  pedidoId,
  empresaId,
  observacion,
}: {
  pedidoId: string;
  empresaId: string;
  observacion: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    if (!texto.trim()) return;
    startTransition(async () => {
      const { error: e } = await supabase
        .from('pedidos_observaciones')
        .insert({ empresa_id: empresaId, pedido_id: pedidoId, texto: texto.trim() });
      if (e) setError(e.message);
      else {
        setTexto('');
        setAbierto(false);
        router.refresh();
      }
    });
  }

  return (
    <div style={{ minWidth: 200 }}>
      {observacion ? (
        <div style={{ fontSize: 12, marginBottom: 4 }}>{observacion}</div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Sin observación</div>
      )}
      {abierto ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Motivo del retraso, incidencia…"
            style={{ minHeight: 48, width: '100%', fontSize: 12 }}
            disabled={pending}
          />
          <button type="button" className="boton boton-primario" onClick={guardar} disabled={pending || !texto.trim()}>
            Guardar
          </button>
          <button type="button" className="boton" onClick={() => setAbierto(false)} disabled={pending}>
            Cancelar
          </button>
          {error ? <span style={{ color: 'var(--rojo)', fontSize: 12 }}>{error}</span> : null}
        </div>
      ) : (
        <button type="button" className="boton" onClick={() => setAbierto(true)}>
          {observacion ? 'Añadir' : 'Anotar'}
        </button>
      )}
    </div>
  );
}
