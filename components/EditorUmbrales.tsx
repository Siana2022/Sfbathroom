'use client';
import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UmbralConfig } from '@/lib/datos/configuracion';

type Props = {
  umbrales: UmbralConfig[];
};

export default function EditorUmbrales({ umbrales }: Props) {
  const supabase = createClient();
  const [filas, setFilas] = useState(umbrales);
  const [pendiente, startTransition] = useTransition();
  const [tipo, setTipo] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  function setValor(id: string, campo: 'umbral' | 'activo', valor: string | boolean) {
    setGuardado(false);
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function guardar() {
    startTransition(async () => {
      setTipo({});
      let error: { message: string } | null = null;
      for (const f of filas) {
        const umbral = f.umbral === null ? null : Number(f.umbral);
        if (umbral !== null && Number.isNaN(umbral)) {
          error = { message: `Umbral inválido en ${f.nombre}.` };
          break;
        }
        const { error: e } = await supabase
          .from('alertas_config')
          .update({ umbral, activo: f.activo })
          .eq('id', f.id);
        if (e) {
          error = { message: `No se pudo guardar ${f.nombre}: ${e.message}` };
          break;
        }
      }
      if (error) setTipo({ guardado: 'error', mensaje: error.message });
      else setGuardado(true);
    });
  }

  return (
    <div>
      {guardado ? <p className="nota">Umbrales guardados.</p> : null}
      {tipo.guardado === 'error' ? <p className="nota" style={{ color: 'var(--error, darkred)' }}>{tipo.mensaje}</p> : null}
      <table className="tabla">
        <thead>
          <tr>
            <th>Regla</th>
            <th className="td-num">Umbral</th>
            <th>Unidad</th>
            <th>Activa</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>
                <strong>{f.nombre}</strong>
                <br />
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{f.modulo}</span>
              </td>
              <td className="td-num">
                <input
                  type="number"
                  step="any"
                  value={f.umbral ?? ''}
                  onChange={(e) => setValor(f.id, 'umbral', e.target.value)}
                  style={{ width: 110, padding: '4px 8px', textAlign: 'right' }}
                />
              </td>
              <td>{f.unidad ?? '—'}</td>
              <td>
                <input type="checkbox" checked={f.activo} onChange={(e) => setValor(f.id, 'activo', e.target.checked)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="boton" onClick={guardar} disabled={pendiente} style={{ marginTop: 12 }}>
        {pendiente ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}