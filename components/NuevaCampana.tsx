'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NuevaCampana({
  empresas,
  empresaId,
}: {
  /** Empresas donde puede crear la campaña (una, o las tres si es comercial). */
  empresas: { id: string; codigo: string }[];
  empresaId?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nombre, setNombre] = useState('');
  const [empresaSel, setEmpresaSel] = useState(
    empresaId ?? empresas.find((e) => e.codigo === 'SF')?.id ?? empresas[0]?.id ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  function crear() {
    if (!nombre.trim()) return;
    startTransition(async () => {
      const { data, error: e } = await supabase
        .from('campanas_email')
        .insert({ empresa_id: empresaSel, nombre: nombre.trim(), asunto: '', bloques: [] })
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
        {empresas.length > 1 ? (
          <label className="campo-filtro">
            Empresa
            <select value={empresaSel} onChange={(e) => setEmpresaSel(e.target.value)}>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.codigo}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="campo-filtro" style={{ minWidth: 260 }}>
          Nombre
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Rebajas de enero" />
        </label>
        <button type="button" className="boton" onClick={crear} disabled={pending || !nombre.trim() || !empresaSel}>
          {pending ? 'Creando…' : 'Crear campaña'}
        </button>
      </div>
      {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
    </div>
  );
}
