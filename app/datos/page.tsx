import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { TABLAS_EDITABLES } from '@/lib/datos/tablasEditables';
import EditorDatos from '@/components/EditorDatos';


export default async function DatosPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi',
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <p>No autenticado.</p>;

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const rol = (perfil as { role: string | null } | null)?.role ?? null;
  const puedeEditar = rol === 'admin' || rol === 'direccion';

  const empresa = await getEmpresaPorCodigo(cookieStore.get('sfb_empresa')?.value ?? 'SF');

  return (
    <div>
      <p className="breadcrumb">Administración · Datos</p>
      <h1>Edición de datos</h1>
      {!puedeEditar ? (
        <div className="card">
          <h2>Acceso restringido</h2>
          <p style={{ color: 'var(--muted)' }}>
            Tu rol actual es <strong>{rol ?? 'sin rol'}</strong>. Esta herramienta la pueden usar
            {` `}admin y dirección. Si necesitas acceso, pídelo al administrador.
          </p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
            Alta, edición y borrado de registros directamente en Supabase (con RLS). Apto para
            cargar datos manuales mientras A3ERP no esté conectado. Todo lo que guardes aquí
            alimenta el cuadro de mando en la siguiente lectura.
          </p>
          <EditorDatos tablas={TABLAS_EDITABLES} empresaId={empresa.id} empresaNombre={empresa.nombre} />
        </>
      )}
    </div>
  );
}