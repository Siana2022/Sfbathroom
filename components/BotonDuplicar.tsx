'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function BotonDuplicar({ campanaId }: { campanaId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function duplicar() {
    startTransition(async () => {
      const { data: origen } = await supabase
        .from('campanas_email')
        .select('empresa_id, nombre, asunto, remitente, bloques, segmento')
        .eq('id', campanaId)
        .maybeSingle();
      if (!origen) {
        setError('No se pudo leer la campaña.');
        return;
      }
      const o = origen as {
        empresa_id: string;
        nombre: string;
        asunto: string;
        remitente: string;
        bloques: unknown;
        segmento: unknown;
      };
      const { data, error: e } = await supabase
        .from('campanas_email')
        .insert({
          empresa_id: o.empresa_id,
          nombre: `${o.nombre} (copia)`,
          asunto: o.asunto,
          remitente: o.remitente,
          bloques: o.bloques,
          segmento: o.segmento,
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
      <button type="button" className="boton" onClick={duplicar} disabled={pending}>
        {pending ? 'Duplicando…' : 'Duplicar campaña'}
      </button>
      {error ? <span style={{ color: 'var(--rojo)', fontSize: 12, marginLeft: 8 }}>{error}</span> : null}
    </span>
  );
}
