import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import EditorEmail from '@/components/EditorEmail';
import PanelEnvio from '@/components/PanelEnvio';
import { esComercialValido } from '@/lib/datos/filtros';
import { getUsuario } from '@/lib/datos/role';
import type { BloqueEmail } from '@/lib/marketing/bloques';

export default async function CampanaPage({ params }: { params: { id: string } }) {
  const empresaCodigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(empresaCodigo);
  const supabase = createClient();
  const usuario = await getUsuario();
  const esComercial = usuario?.rol === 'comercial';

  const { data } = await supabase
    .from('campanas_email')
    .select('id, nombre, asunto, bloques, segmento, estado, enviados, fallidos, total')
    .eq('id', params.id)
    .eq('empresa_id', empresa.id)
    .maybeSingle();

  if (!data) notFound();
  const c = data as {
    id: string;
    nombre: string;
    asunto: string;
    bloques: BloqueEmail[];
    segmento: Record<string, unknown>;
    estado: string;
    enviados: number;
    fallidos: number;
    total: number;
  };

  const { data: comercialesRaw } = await supabase.from('comerciales').select('id, nombre').eq('activo', true).order('nombre');
  const comerciales = ((comercialesRaw ?? []) as { id: string; nombre: string }[]).filter((x) => esComercialValido(x.nombre));

  return (
    <div>
      <p className="breadcrumb">
        <Link href="/marketing/campanas" className="enlace">Campañas</Link> · {c.nombre}
      </p>
      <h1>{c.nombre}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Estado: <strong>{c.estado}</strong> · Enviados: <strong>{c.enviados}</strong> · Fallidos: <strong>{c.fallidos}</strong>
      </p>

      {c.estado === 'enviada' ? (
        <div className="card"><p>Esta campaña ya se envió. Duplícala para volver a usarla.</p></div>
      ) : (
        <EditorEmail
          campanaId={c.id}
          nombreInicial={c.nombre}
          asuntoInicial={c.asunto}
          bloquesIniciales={c.bloques ?? []}
        />
      )}

      <PanelEnvio
        campanaId={c.id}
        empresaId={empresa.id}
        comerciales={comerciales}
        segmentoInicial={c.segmento ?? {}}
        estadoCampana={c.estado}
        esComercial={esComercial}
      />
    </div>
  );
}
