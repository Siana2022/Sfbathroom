import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import EditorEmail from '@/components/EditorEmail';
import type { BloqueEmail } from '@/lib/marketing/bloques';

export default async function PlantillaPage({ params }: { params: { id: string } }) {
  const empresaCodigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(empresaCodigo);
  const supabase = createClient();

  const { data } = await supabase
    .from('plantillas_email')
    .select('id, nombre, asunto, bloques')
    .eq('id', params.id)
    .eq('empresa_id', empresa.id)
    .maybeSingle();

  if (!data) notFound();
  const p = data as { id: string; nombre: string; asunto: string; bloques: BloqueEmail[] };

  return (
    <div>
      <p className="breadcrumb">
        <Link href="/marketing/plantillas" className="enlace">Plantillas</Link> · {p.nombre}
      </p>
      <h1>{p.nombre}</h1>
      <EditorEmail
        campanaId={p.id}
        empresaId={empresa.id}
        nombreInicial={p.nombre}
        asuntoInicial={p.asunto}
        bloquesIniciales={p.bloques ?? []}
        destino="plantilla"
      />
    </div>
  );
}
