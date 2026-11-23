'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Plantilla = { id: string; nombre: string; puntos: string[] };

export default function PlantillasReunion({
  empresaId,
  comercialId,
  plantillasIniciales,
}: {
  empresaId: string;
  comercialId: string | null;
  plantillasIniciales: Plantilla[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nombre, setNombre] = useState('');
  const [puntos, setPuntos] = useState('');
  const [editando, setEditando] = useState<Plantilla | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lista = (texto: string) => texto.split('\n').map((p) => p.trim()).filter(Boolean);

  function guardar() {
    if (!nombre.trim()) return;
    startTransition(async () => {
      const filas = { nombre: nombre.trim(), puntos: lista(puntos) };
      const { error: e } = editando
        ? await supabase.from('reunion_plantillas').update(filas).eq('id', editando.id)
        : await supabase.from('reunion_plantillas').insert({ empresa_id: empresaId, comercial_id: comercialId, ...filas });
      if (e) setError(e.message);
      else {
        setNombre('');
        setPuntos('');
        setEditando(null);
        router.refresh();
      }
    });
  }

  function editar(p: Plantilla) {
    setEditando(p);
    setNombre(p.nombre);
    setPuntos((p.puntos ?? []).join('\n'));
  }

  function borrar(id: string) {
    if (!window.confirm('¿Eliminar esta plantilla?')) return;
    startTransition(async () => {
      const { error: e } = await supabase.from('reunion_plantillas').delete().eq('id', id);
      if (e) setError(e.message);
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="card">
        <h2>{editando ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
        <label className="campo-editor">
          <span>Nombre de la plantilla</span>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Visita presencial" />
        </label>
        <label className="campo-editor">
          <span>Puntos (uno por línea)</span>
          <textarea value={puntos} onChange={(e) => setPuntos(e.target.value)} rows={5} placeholder="Presentación, revisar stock, próximos pasos…" />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="boton boton-primario" onClick={guardar} disabled={pending || !nombre.trim()}>
            {pending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear plantilla'}
          </button>
          {editando ? (
            <button type="button" className="boton" onClick={() => { setEditando(null); setNombre(''); setPuntos(''); }}>Cancelar</button>
          ) : null}
        </div>
        {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
      </div>

      <div className="card">
        <h2>Plantillas ({plantillasIniciales.length})</h2>
        {plantillasIniciales.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Crea la primera plantilla arriba.</p>
        ) : (
          plantillasIniciales.map((p) => (
            <div key={p.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ flex: 1 }}>{p.nombre}</strong>
                <button type="button" className="boton" onClick={() => editar(p)} disabled={pending}>Editar</button>
                <button type="button" className="boton" onClick={() => borrar(p.id)} disabled={pending}>Borrar</button>
              </div>
              <ul style={{ margin: '6px 0 0 18px', color: 'var(--muted)', fontSize: 13 }}>
                {(p.puntos ?? []).map((punto, i) => <li key={i}>{punto}</li>)}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
