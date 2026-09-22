import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';


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

  const esAdmin = rol === 'admin';

  return (
    <div>
      <p className="breadcrumb">Administración</p>
      <h1>Administración de usuarios</h1>
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

          <div className="card">
            <h2>Usuarios ({usuarios.length})</h2>
            {error ? (
              <p style={{ color: 'var(--muted)' }}>
                No se pudo listar (¿existe la función <code>admin_listar_usuarios</code>?
                Aplica la migración 0008 o pégala en SQL Editor).
              </p>
            ) : (
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Cartera (comercial_id)</th>
                      <th>Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email ?? '—'}</td>
                        <td>
                          <span className={u.rol === 'admin' ? 'badge construccion' : 'badge listo'}>
                            {u.rol ?? 'sin rol'}
                          </span>
                        </td>
                        <td>{u.comercial_id ?? '—'}</td>
                        <td>{u.created_at ? u.created_at.slice(0, 10) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Cambiar rol / cartera</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
              Selecciona un usuario y guarda. Solo admin.
            </p>
            <pre style={{ background: 'var(--card-bg)', padding: 16, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
{`-- Asignar rol (admin|direccion|comercial|financiero|lectura|administracion|almacen)
update public.profiles
set role = 'direccion'
where id = (select id from auth.users where email = 'email@ejemplo.com');

-- Asignar cartera a un comercial
update public.profiles
set comercial_id = (select id from public.comerciales where nombre = 'NOMBRE')
where id = (select id from auth.users where email = 'email@ejemplo.com');`}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}