import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import PlantillasReunion from '@/components/PlantillasReunion';
import { getUsuario } from '@/lib/datos/role';

export default async function PlantillasReunionPage() {
  const codigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(codigo);
  const supabase = createClient();
  const usuario = await getUsuario();
  const esComercial = usuario?.rol === 'comercial';
  let consulta = supabase
    .from('reunion_plantillas')
    .select('id, nombre, puntos')
    .eq('empresa_id', empresa.id);
  if (esComercial && usuario?.comercialIds?.length) {
    consulta = consulta.or(`comercial_id.is.null,comercial_id.in.(${usuario.comercialIds.join(',')})`);
  }
  const { data } = await consulta.order('nombre');

  const plantillas = ((data ?? []) as { id: string; nombre: string; puntos: string[] }[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    puntos: Array.isArray(p.puntos) ? p.puntos : [],
  }));

  return (
    <div>
      <p className="breadcrumb">
        <Link href="/agenda" className="enlace">Mi agenda</Link> · Plantillas de reunión
      </p>
      <h1>Plantillas de reunión</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Cada comercial podrá cargar estos puntos al preparar o cerrar una reunión.
      </p>
      <PlantillasReunion
        empresaId={empresa.id}
        comercialId={usuario?.comercialId ?? null}
        plantillasIniciales={plantillas}
      />
    </div>
  );
}
