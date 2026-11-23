import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

const ROLES_PERMITIDOS_MARGEN = new Set(['admin', 'direccion', 'financiero']);

/**
 * Usuario + rol, deduplicado dentro de la misma petición (React cache).
 * Evita repetir `auth.getUser()` y la consulta a profiles en cada función de datos.
 */
export const getUsuario = cache(async (): Promise<{ id: string; rol: string | null; comercialId: string | null; comercialIds: string[] } | null> => {
  const supabase = createClient();
  // getSession lee la cookie sin llamar a Auth; la autorización real es RLS.
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user ?? null;
  if (!user) return null;
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, comercial_id')
    .eq('id', user.id)
    .maybeSingle();
  const p = perfil as { role: string | null; comercial_id: string | null } | null;
  let extra: string[] = [];
  if (p?.role === 'comercial') {
    const { data: pcs } = await supabase
      .from('profiles_comerciales')
      .select('comercial_id')
      .eq('profile_id', user.id);
    extra = ((pcs ?? []) as { comercial_id: string }[]).map((x) => x.comercial_id);
  }
  const comercialIds = [...new Set([...(p?.comercial_id ? [p.comercial_id] : []), ...extra])];
  return { id: user.id, rol: p?.role ?? null, comercialId: p?.comercial_id ?? null, comercialIds };
});

export async function getRol(): Promise<string | null> {
  return (await getUsuario())?.rol ?? null;
}

export function puedeVerMargenes(rol: string | null): boolean {
  return rol !== null && ROLES_PERMITIDOS_MARGEN.has(rol);
}