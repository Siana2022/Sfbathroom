import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import EditorEmail from '@/components/EditorEmail';
import PanelEnvio from '@/components/PanelEnvio';
import BotonDuplicar from '@/components/BotonDuplicar';
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

  const { data: eventosRaw } = await supabase
    .from('campana_eventos')
    .select('email, tipo')
    .eq('campana_id', c.id)
    .limit(20000);

  const eventos = (eventosRaw ?? []) as { email: string | null; tipo: string }[];
  const unicos = (tipo: string) =>
    new Set(eventos.filter((e) => e.tipo === tipo).map((e) => (e.email ?? '').toLowerCase())).size;
  const metricas = {
    aperturas: unicos('apertura'),
    clics: unicos('clic'),
    rebotes: unicos('rebote'),
    quejas: unicos('queja'),
  };

  const { data: comercialesRaw } = await supabase.from('comerciales').select('id, nombre').eq('activo', true).order('nombre');
  const comerciales = ((comercialesRaw ?? []) as { id: string; nombre: string }[]).filter((x) => esComercialValido(x.nombre));

  return (
    <div>
      <p className="breadcrumb">
        <Link href="/marketing/campanas" className="enlace">Campañas</Link> · {c.nombre}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <h1 style={{ marginBottom: 6 }}>{c.nombre}</h1>
        <BotonDuplicar campanaId={c.id} />
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Estado: <strong>{c.estado}</strong> · Enviados: <strong>{c.enviados}</strong> · Fallidos: <strong>{c.fallidos}</strong>
      </p>

      <ul className="grid-kpis">
        <li className="kpi"><span className="kpi-etiqueta">Aperturas únicas</span><strong className="kpi-valor">{metricas.aperturas}</strong><span className="kpi-nota">{c.enviados > 0 ? `${Math.round((metricas.aperturas / c.enviados) * 100)}%` : '—'} de enviados</span></li>
        <li className="kpi"><span className="kpi-etiqueta">Clics únicos</span><strong className="kpi-valor">{metricas.clics}</strong><span className="kpi-nota">{c.enviados > 0 ? `${Math.round((metricas.clics / c.enviados) * 100)}%` : '—'} de enviados</span></li>
        <li className="kpi"><span className="kpi-etiqueta">Rebotes</span><strong className="kpi-valor">{metricas.rebotes}</strong><span className="kpi-nota">direcciones no entregadas</span></li>
        <li className="kpi"><span className="kpi-etiqueta">Quejas</span><strong className="kpi-valor">{metricas.quejas}</strong><span className="kpi-nota">marcados como spam</span></li>
      </ul>

      {c.estado === 'enviada' ? (
        <div className="card"><p>Esta campaña ya se envió. Duplícala para volver a usarla.</p></div>
      ) : (
        <EditorEmail
          campanaId={c.id}
          empresaId={empresa.id}
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
