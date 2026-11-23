import Link from 'next/link';
import { cookies } from 'next/headers';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { createClient } from '@/lib/supabase/server';
import { getUsuario } from '@/lib/datos/role';
import NuevaCampana from '@/components/NuevaCampana';

export default async function CampanasPage() {
  const empresaCodigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(empresaCodigo);
  const usuario = await getUsuario();
  const supabase = createClient();

  const { data } = await supabase
    .from('campanas_email')
    .select('id, nombre, asunto, estado, total, enviados, fallidos, created_at, enviada_at')
    .eq('empresa_id', empresa.id)
    .order('created_at', { ascending: false });

  const campanas = (data ?? []) as {
    id: string;
    nombre: string;
    asunto: string;
    estado: string;
    total: number;
    enviados: number;
    fallidos: number;
    created_at: string;
    enviada_at: string | null;
  }[];

  const puede = usuario?.rol === 'admin' || usuario?.rol === 'direccion' || usuario?.rol === 'comercial';

  return (
    <div>
      <p className="breadcrumb">Marketing · Email</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 6 }}>Campañas de email</h1>
        <span style={{ display: 'flex', gap: 8 }}>
          <Link href="/marketing/plantillas" className="boton">Plantillas</Link>
          <Link href="/marketing/bajas" className="boton">Bajas</Link>
        </span>
      </div>
      {!puede ? (
        <div className="card"><p>Solo administración, dirección y comerciales pueden gestionar campañas.</p></div>
      ) : (
        <>
          <NuevaCampana empresaId={empresa.id} />
          <div className="card">
            <h2>Campañas ({campanas.length})</h2>
            {campanas.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Todavía no hay campañas.</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Asunto</th>
                    <th>Estado</th>
                    <th className="td-num">Enviados</th>
                    <th className="td-num">Fallidos</th>
                    <th>Creada</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {campanas.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td>{c.asunto || '—'}</td>
                      <td><span className={c.estado === 'enviada' ? 'badge listo' : 'badge construccion'}>{c.estado}</span></td>
                      <td className="td-num">{c.enviados}</td>
                      <td className="td-num">{c.fallidos}</td>
                      <td>{c.created_at.slice(0, 10)}</td>
                      <td><Link className="enlace" href={`/marketing/campanas/${c.id}`}>Abrir</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
