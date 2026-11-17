import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

const ROLES_PERMITIDOS_MARGEN = new Set(['admin', 'direccion', 'financiero']);

/**
 * Usuario + rol, deduplicado dentro de la misma petición (React cache).
 * Evita repetir `auth.getUser()` y la consulta a profiles en cada función de datos.
 */
export const getUsuario = cache(async (): Promise<{ id: string; rol: string | null } | null> => {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return { id: user.id, rol: (perfil as { role: string | null } | null)?.role ?? null };
});

export async function getRol(): Promise<string | null> {
  return (await getUsuario())?.rol ?? null;
}

export function puedeVerMargenes(rol: string | null): boolean {
  return rol !== null && ROLES_PERMITIDOS_MARGEN.has(rol);
}