'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function BotonNuevaPlantilla({ empresaId }: { empresaId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function crear() {
    const nombre = window.prompt('Nombre de la plantilla', 'Nueva plantilla');
    if (!nombre) return;
    startTransition(async () => {
      const { data, error: e } = await supabase
        .from('plantillas_email')
        .insert({ empresa_id: empresaId, nombre, asunto: '', bloques: [] })
        .select('id')
        .single();
      if (e) setError(e.message);
      else router.push(`/marketing/plantillas/${(data as { id: string }).id}`);
    });
  }

  return (
    <span>
      <button type="button" className="boton boton-primario" onClick={crear} disabled={pending}>
        {pending ? 'Creando…' : 'Nueva plantilla'}
      </button>
      {error ? <span style={{ color: 'var(--rojo)', fontSize: 12, marginLeft: 8 }}>{error}</span> : null}
    </span>
  );
}
