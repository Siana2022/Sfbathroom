'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  clienteId: string;
  interaccionId?: string;
  /** Si el histórico ya tiene un resumen guardado, se muestra al abrir. */
  resumenGuardado?: string | null;
  conclusionesGuardadas?: string | null;
};

type Modo = 'resumen' | 'conclusiones';

/**
 * Resumen y conclusiones del histórico con IA, bajo demanda.
 *
 * Nunca se lanza solo: cada pulsación es una llamada al proveedor de LLM, así
 * que el usuario decide cuándo gastarla.
 */
export default function ResumenIA({ clienteId, interaccionId, resumenGuardado, conclusionesGuardadas }: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState<string | null>(resumenGuardado ?? null);
  const [conclusiones, setConclusiones] = useState<string | null>(conclusionesGuardadas ?? null);
  const [cargando, setCargando] = useState<Modo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<boolean | null>(null);

  async function pedir(modo: Modo) {
    setCargando(modo);
    setError(null);
    setGuardado(null);
    try {
      const res = await fetch('/api/comercial/resumen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, interaccion_id: interaccionId, modo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo generar.');
      if (modo === 'resumen') setTexto(body.texto);
      else setConclusiones(body.texto);
      setGuardado(Boolean(body.guardado));
      if (body.aviso) setError(body.aviso);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar.');
    } finally {
      setCargando(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" type="button" onClick={() => pedir('resumen')} disabled={cargando !== null}>
          {cargando === 'resumen' ? 'Resumiendo…' : 'Resumir con IA'}
        </button>
        <button className="btn" type="button" onClick={() => pedir('conclusiones')} disabled={cargando !== null}>
          {cargando === 'conclusiones' ? 'Analizando…' : 'Sacar conclusiones'}
        </button>
        {guardado === true && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Guardado en el histórico ✓</span>}
      </div>

      {error && <p style={{ fontSize: 13, color: 'var(--error, darkred)', margin: 0 }}>{error}</p>}

      {texto && (
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Resumen del histórico</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{texto}</p>
        </div>
      )}

      {conclusiones && (
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Conclusiones y próximos pasos</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{conclusiones}</p>
        </div>
      )}
    </div>
  );
}
