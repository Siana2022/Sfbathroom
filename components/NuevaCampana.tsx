'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NuevaCampana({ empresaId }: { empresaId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  function crear() {
    if (!nombre.trim()) return;
    startTransition(async () => {
      const { data, error: e } = await supabase
        .from('campanas_email')
        .insert({ empresa_id: empresaId, nombre: nombre.trim(), asunto: '', bloques: [] })
        .select('id')
        .single();
      if (e) setError(e.message);
      else router.push(`/marketing/campanas/${(data as { id: string }).id}`);
    });
  }

  return (
    <div className="card">
      <h2>Nueva campaña</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="campo-filtro" style={{ minWidth: 260 }}>
          Nombre
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Rebajas de enero" />
        </label>
        <button type="button" className="boton" onClick={crear} disabled={pending || !nombre.trim()}>
          {pending ? 'Creando…' : 'Crear campaña'}
        </button>
      </div>
      {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
    </div>
  );
}
