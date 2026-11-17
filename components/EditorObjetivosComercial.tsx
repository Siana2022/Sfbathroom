'use client';
import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { eur } from '@/lib/formato';
import type { ObjetivoComercial } from '@/lib/datos/configuracion';

export default function EditorObjetivosComercial({
  empresaId,
  anio,
  filas,
}: {
  empresaId: string;
  anio: number;
  filas: ObjetivoComercial[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState(
    filas.map((f) => ({ ...f, texto: f.importe > 0 ? String(f.importe) : '' })),
  );
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const total = rows.reduce((s, r) => s + (Number(r.texto) || 0), 0);

  function guardar() {
    startTransition(async () => {
      const cuerpo = rows.map((r) => ({
        empresa_id: empresaId,
        anio,
        comercial_id: r.comercialId,
        importe: Number(r.texto) || 0,
        actualizado: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('objetivos_comercial')
        .upsert(cuerpo, { onConflict: 'empresa_id,anio,comercial_id' });
      if (error) setEstado({ tipo: 'error', mensaje: `No se pudo guardar: ${error.message}` });
      else setEstado({ tipo: 'ok', mensaje: `Objetivos ${anio} guardados.` });
    });
  }

  return (
    <div>
      <h2>Objetivos por comercial · {anio}</h2>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Importe anual objetivo de cada comercial. Se usa en <strong>Trabajo comercial</strong> para el
        cumplimiento y en los KPIs.
      </p>
      {estado ? (
        <p className="nota" style={estado.tipo === 'error' ? { color: 'var(--rojo)' } : undefined}>
          {estado.mensaje}
        </p>
      ) : null}
      <table className="tabla">
        <thead>
          <tr>
            <th>Comercial</th>
            <th className="td-num">Objetivo anual (€)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.comercialId}>
              <td>{r.nombre}</td>
              <td className="td-num">
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={r.texto}
                  onChange={(e) =>
                    setRows((prev) => prev.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))
                  }
                  style={{ width: 140, padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 8, textAlign: 'right' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Total: {eur(total)}</span>
        <button type="button" className="boton" onClick={guardar} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar objetivos'}
        </button>
      </div>
    </div>
  );
}
