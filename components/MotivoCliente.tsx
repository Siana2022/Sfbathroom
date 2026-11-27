'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const MOTIVOS = ['Cerró', 'No nos compra', 'Cambio de proveedor', 'Impagos', 'Precio', 'Otros'];

/**
 * Anotación del comercial sobre por qué un cliente está en el semáforo de fuga.
 * Guarda histórico en `clientes_motivos` para poder sacar conclusiones después.
 */
export default function MotivoCliente({
  clienteId,
  empresaId,
  motivo,
  nota,
}: {
  clienteId: string;
  empresaId: string;
  motivo: string | null;
  nota: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState(motivo ?? '');
  const [texto, setTexto] = useState(nota ?? '');
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    if (!sel) return;
    startTransition(async () => {
      const { error: e } = await supabase.from('clientes_motivos').insert({
        empresa_id: empresaId,
        cliente_id: clienteId,
        motivo: sel,
        nota: texto.trim() || null,
      });
      if (e) setError(e.message);
      else {
        setAbierto(false);
        router.refresh();
      }
    });
  }

  if (!abierto) {
    return (
      <button type="button" className={`boton${motivo ? '' : ' boton-primario'}`} onClick={() => setAbierto(true)}>
        {motivo ?? 'Anotar'}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={sel} onChange={(e) => setSel(e.target.value)} disabled={pending} style={{ fontSize: 12 }}>
        <option value="">Motivo…</option>
        {MOTIVOS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Nota (opcional)"
        disabled={pending}
        style={{ fontSize: 12, minWidth: 150 }}
      />
      <button type="button" className="boton boton-primario" onClick={guardar} disabled={pending || !sel}>Guardar</button>
      <button type="button" className="boton" onClick={() => setAbierto(false)} disabled={pending}>Cancelar</button>
      {error ? <span style={{ color: 'var(--rojo)', fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
