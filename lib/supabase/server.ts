import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// URL y clave publishable no son secretas (protegidas por RLS); van como
// fallback igual que en el cliente de navegador, para desarrollo sin .env.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component. Se puede ignorar si el
          // middleware se ocupa de refrescar la sesión.
        }
      },
    },
  });
}