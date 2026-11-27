'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Opcion = { id: string; nombre: string; codigo: string | null };

/**
 * Vincula una interacción pendiente a un cliente. Busca contra `/api/buscar`
 * (misma búsqueda que el buscador global) para no cargar la cartera entera.
 */
export default function VincularInteraccion({ interaccionId }: { interaccionId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const termino = q.trim();
    if (termino.length < 2) {
      setOpciones([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(termino)}`);
        if (!res.ok) return;
        const d = (await res.json()) as { clientes?: Opcion[] };
        if (!cancelado) setOpciones((d.clientes ?? []).slice(0, 6));
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [q]);

  function vincular(cliente: Opcion) {
    startTransition(async () => {
      setError(null);
      // La empresa y el comercial salen del cliente, no de la interacción.
      const { data, error: eCliente } = await supabase
        .from('clientes')
        .select('id, empresa_id, comercial_id')
        .eq('id', cliente.id)
        .maybeSingle();
      if (eCliente || !data) {
        setError(eCliente?.message ?? 'Cliente no encontrado');
        return;
      }
      const { error: e } = await supabase
        .from('interacciones')
        .update({
          cliente_id: cliente.id,
          empresa_id: (data as { empresa_id: string }).empresa_id,
          comercial_id: (data as { comercial_id: string | null }).comercial_id,
          pendiente: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', interaccionId);
      if (e) setError(e.message);
      else {
        setQ('');
        setOpciones([]);
        router.refresh();
      }
    });
  }

  return (
    <div style={{ minWidth: 240 }}>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar cliente…"
        disabled={pending}
        style={{ width: '100%' }}
        aria-label="Buscar cliente para vincular"
      />
      {buscando ? <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>Buscando…</p> : null}
      {opciones.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
          {opciones.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="boton"
                style={{ width: '100%', textAlign: 'left', marginBottom: 4 }}
                onClick={() => vincular(o)}
                disabled={pending}
              >
                {o.nombre}
                {o.codigo ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {o.codigo}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p style={{ color: 'var(--rojo)', fontSize: 12, margin: '4px 0 0' }}>{error}</p> : null}
    </div>
  );
}
