import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import BotonUsarPlantilla from '@/components/BotonUsarPlantilla';
import BotonNuevaPlantilla from '@/components/BotonNuevaPlantilla';

export default async function PlantillasPage() {
  const empresaCodigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(empresaCodigo);
  const supabase = createClient();

  const { data } = await supabase
    .from('plantillas_email')
    .select('id, nombre, asunto, created_at')
    .eq('empresa_id', empresa.id)
    .order('created_at', { ascending: false });

  const plantillas = (data ?? []) as { id: string; nombre: string; asunto: string; created_at: string }[];

  return (
    <div>
      <p className="breadcrumb"><Link href="/marketing/campanas" className="enlace">Campañas</Link> · Plantillas</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 6 }}>Plantillas de email</h1>
        <BotonNuevaPlantilla empresaId={empresa.id} />
      </div>
      <div className="card">
        <h2>{plantillas.length} plantillas</h2>
        {plantillas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Guarda una campaña como plantilla desde su editor.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr><th>Nombre</th><th>Asunto</th><th>Creada</th><th /></tr>
            </thead>
            <tbody>
              {plantillas.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/marketing/plantillas/${p.id}`} className="enlace">{p.nombre}</Link></td>
                  <td>{p.asunto || '—'}</td>
                  <td>{p.created_at.slice(0, 10)}</td>
                  <td>
                    <Link href={`/marketing/plantillas/${p.id}`} className="boton" style={{ marginRight: 6 }}>Editar</Link>
                    <BotonUsarPlantilla plantillaId={p.id} empresaId={empresa.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
