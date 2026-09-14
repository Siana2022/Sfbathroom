import { cookies } from 'next/headers';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { createClient } from '@/lib/supabase/server';
import { getKpisPersonalizadosVistos } from '@/lib/datos/kpisVisibles';
import { METRICAS, FORMATOS } from '@/lib/datos/kpisCatalogo';
import ConstructorKpi from '@/components/kpis/ConstructorKpi';

export const dynamic = 'force-dynamic';

export default async function KpisPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let rol: string | null = null;
  if (user) {
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    rol = perfil?.role ?? null;
  }
  const esAdmin = rol === 'admin' || rol === 'direccion';
  const kpis = esAdmin ? await getKpisPersonalizadosVistos(empresa) : [];

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · KPIs personalizados</p>
      <h1>Mis KPIs personalizados</h1>
      {!esAdmin && (
        <div className="card">
          <p style={{ color: 'var(--muted)' }}>Acceso restringido a usuarios con rol admin o dirección.</p>
        </div>
      )}
      {esAdmin && (
        <>
          <ConstructorKpi empresa={empresa} />
          {kpis.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2>KPIs guardados ({kpis.length})</h2>
              <ul className="grid-kpis" style={{ gap: 10 }}>
                {kpis.map((k) => (
                  <li key={k.id} className="kpi">
                    <span className="kpi-etiqueta">
                      {k.nombre}
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: 'var(--tenue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                        {METRICAS[k.metrica as keyof typeof METRICAS]?.etiqueta ?? k.metrica} · {k.calculo}
                      </span>
                    </span>
                    <strong className="kpi-valor" style={{ color: k.estaBueno === null ? undefined : k.estaBueno ? 'var(--verde)' : 'var(--rojo)' }}>
                      {k.fmt}
                    </strong>
                    <span className="kpi-nota">
                      {k.objetivo != null
                        ? `${k.objetivo_op === 'gte' ? 'Objetivo ≥' : 'Objetivo ≤'} ${FORMATOS[k.formato]?.fmt(k.objetivo) ?? k.objetivo}`
                        : 'Sin objetivo'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}