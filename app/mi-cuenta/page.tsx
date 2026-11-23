import { createClient } from '@/lib/supabase/server';
import { getUsuario } from '@/lib/datos/role';
import CambiarPassword from '@/components/CambiarPassword';

export default async function MiCuentaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const usuario = await getUsuario();
  const { data: perfil } = user
    ? await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
    : { data: null };

  const p = perfil as { full_name: string | null; role: string | null } | null;

  return (
    <div>
      <p className="breadcrumb">Mi cuenta</p>
      <h1>{p?.full_name ?? user?.email ?? 'Mi cuenta'}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {user?.email} · Rol: <strong>{p?.role ?? usuario?.rol ?? '—'}</strong>
      </p>
      <CambiarPassword email={user?.email ?? null} />
    </div>
  );
}
