'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function BotonUsarPlantilla({ plantillaId, empresaId }: { plantillaId: string; empresaId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function usar() {
    startTransition(async () => {
      const { data: p } = await supabase
        .from('plantillas_email')
        .select('nombre, asunto, bloques')
        .eq('id', plantillaId)
        .maybeSingle();
      if (!p) {
        setError('No se pudo leer.');
        return;
      }
      const plantilla = p as { nombre: string; asunto: string; bloques: unknown };
      const { data, error: e } = await supabase
        .from('campanas_email')
        .insert({
          empresa_id: empresaId,
          nombre: `${plantilla.nombre} (campaña)`,
          asunto: plantilla.asunto,
          bloques: plantilla.bloques,
          estado: 'borrador',
        })
        .select('id')
        .single();
      if (e) setError(e.message);
      else router.push(`/marketing/campanas/${(data as { id: string }).id}`);
    });
  }

  return (
    <span>
      <button type="button" className="boton" onClick={usar} disabled={pending}>
        {pending ? 'Creando…' : 'Usar en campaña'}
      </button>
      {error ? <span style={{ color: 'var(--rojo)', fontSize: 12, marginLeft: 8 }}>{error}</span> : null}
    </span>
  );
}
