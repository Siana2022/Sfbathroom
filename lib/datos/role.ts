import { createClient } from '@/lib/supabase/server';

const ROLES_PERMITIDOS_MARGEN = new Set(['admin', 'direccion', 'financiero']);

export async function getRol(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return (perfil as { role: string | null } | null)?.role ?? null;
}

export function puedeVerMargenes(rol: string | null): boolean {
  return rol !== null && ROLES_PERMITIDOS_MARGEN.has(rol);
}