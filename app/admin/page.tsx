import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import AdminUsuarios from '@/components/AdminUsuarios';
import { esComercialValido } from '@/lib/datos/filtros';


type UsuarioAdmin = {
  id: string;
  email: string | null;
  rol: string | null;
  comercial_id: string | null;
  created_at: string | null;
};

export default async function AdminPage() {
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

  const { data: usuariosRaw, error } = await supabase.rpc('admin_listar_usuarios');
  const usuarios = (usuariosRaw ?? []) as UsuarioAdmin[];

  const { data: comercialesRaw } = await supabase
    .from('comerciales')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');
  const comerciales = ((comercialesRaw ?? []) as { id: string; nombre: string }[]).filter((c) =>
    esComercialValido(c.nombre),
  );

  const { data: pcRaw } = await supabase.from('profiles_comerciales').select('profile_id, comercial_id');
  const asignaciones: Record<string, string[]> = {};
  for (const r of (pcRaw ?? []) as { profile_id: string; comercial_id: string }[]) {
    asignaciones[r.profile_id] = [...(asignaciones[r.profile_id] ?? []), r.comercial_id];
  }

  const esAdmin = rol === 'admin';

  return (
    <div>
      <p className="breadcrumb">Administración</p>
      <h1>Administración de usuarios</h1>
      <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Link href="/marketing/campanas" className="boton">Email marketing</Link>
        <Link href="/marketing/plantillas" className="boton">Plantillas de email</Link>
        <Link href="/marketing/bajas" className="boton">Bajas de correo</Link>
        <Link href="/configuracion/plantillas-reunion" className="boton">Plantillas de reunión</Link>
      </p>
      {!esAdmin ? (
        <div className="card">
          <h2>Acceso restringido</h2>
          <p style={{ color: 'var(--muted)' }}>
            Tu rol actual es <strong>{rol ?? 'sin rol'}</strong>. Solo los administradores
            pueden gestionar usuarios. Si necesitas acceso, ejecuta en Supabase SQL Editor:
          </p>
          <pre style={{ background: 'var(--card-bg)', padding: 16, borderRadius: 8, marginTop: 8, fontSize: 13, overflowX: 'auto' }}>
{`select id, email from auth.users where email = 'TU_EMAIL';

update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'TU_EMAIL');`}
          </pre>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
            Gestión de usuarios, roles y cartera (Cartera = el comercial asignado
            para clientes con visibilidad limitada). Los cambios de rol se aplican al
            instante vía RLS.
          </p>

          <AdminUsuarios usuarios={usuarios} comerciales={comerciales} asignaciones={asignaciones} />
        </>
      )}
    </div>
  );
}