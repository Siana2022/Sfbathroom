import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getFacturacion, getEmpresaPorCodigo } from '@/lib/datos/facturacion';

const DragDashboard = dynamic(() => import('@/components/DragDashboard'), { ssr: false, loading: () => <p style={{ color: 'var(--muted)' }}>Cargando panel…</p> });

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function MiPanelPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const rol = perfil?.role;
  if (rol !== 'admin' && rol !== 'direccion') notFound();

  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresaL = await getEmpresaPorCodigo(empresa);
  const d = await getFacturacion(empresa, ANIO);
  const { data: clientesRaw } = await supabase
    .from('facturas')
    .select('cliente_id')
    .eq('empresa_id', empresaL.id)
    .gte('fecha', `${ANIO}-01-01`)
    .lte('fecha', `${ANIO}-12-31`);
  const numClientes = new Set((clientesRaw ?? []).map((f: { cliente_id: string | null }) => f.cliente_id).filter(Boolean)).size;
  const { data: resumen } = await supabase
    .from('resumenes')
    .select('texto')
    .eq('empresa_id', empresaL.id)
    .order('fecha', { ascending: false })
    .limit(1);

  return (
    <div>
      <p className="breadcrumb">Tu panel</p>
      <h1>Mi panel · {d.empresa.nombre}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Arrastra y redimensiona las tarjetas. El diseño se guarda automáticamente en este
        dispositivo (no se sincroniza entre equipos).
      </p>
      <DragDashboard
        neta={d.neta}
        clientes={0}
        ticket={d.ticketMedio}
        resumen={resumen?.[0]?.texto ?? null}
      />
    </div>
  );
}