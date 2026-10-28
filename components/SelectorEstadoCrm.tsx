'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ESTADOS_CRM } from '@/lib/comercial/tipos';

type Props = {
  clienteId: string;
  estadoActual: string | null;
  motivoActual: string | null;
  /** Sin permiso de escritura se muestra como distintivo, no como desplegable. */
  editable: boolean;
};

/**
 * Estado CRM del cliente: habitual, nuevo, en seguimiento, ganado o perdido.
 *
 * Es el estado que decide el comercial, independiente del que se deduce de los
 * pedidos. El motivo solo se pide cuando se marca como perdido, que es cuando
 * aporta algo.
 */
export default function SelectorEstadoCrm({ clienteId, estadoActual, motivoActual, editable }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState(estadoActual ?? '');
  const [motivo, setMotivo] = useState(motivoActual ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(nuevoEstado: string, nuevoMotivo: string) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/comercial/clientes/${clienteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_crm: nuevoEstado || null, motivo_perdida: nuevoMotivo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar el estado.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  }

  if (!editable) {
    const etiqueta = ESTADOS_CRM.find((e) => e.valor === estadoActual)?.etiqueta;
    return etiqueta ? <span className={`badge-crm crm-${estadoActual}`}>{etiqueta}</span> : <span>—</span>;
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        className="input-dato"
        style={{ fontSize: 12.5, padding: '5px 9px' }}
        value={estado}
        disabled={guardando}
        onChange={(e) => {
          const v = e.target.value;
          setEstado(v);
          // Al cambiar a algo que no sea "perdido", el motivo deja de tener
          // sentido y se limpia también en el servidor.
          guardar(v, v === 'perdido' ? motivo : '');
        }}
      >
        <option value="">Sin estado</option>
        {ESTADOS_CRM.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.etiqueta}
          </option>
        ))}
      </select>

      {estado === 'perdido' && (
        <input
          className="input-dato"
          style={{ fontSize: 12.5, padding: '5px 9px', width: 150 }}
          placeholder="Motivo de la pérdida"
          value={motivo}
          disabled={guardando}
          onChange={(e) => setMotivo(e.target.value)}
          onBlur={() => guardar('perdido', motivo)}
        />
      )}

      {error && <span style={{ color: 'var(--rojo)', fontSize: 12 }}>{error}</span>}
    </span>
  );
}
