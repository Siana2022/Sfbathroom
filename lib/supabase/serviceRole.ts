import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente con service_role: SOLO para procesos server-side (jobs del cron,
// ingesta n8n, escritura de notificaciones). NUNCA importar desde componentes
// de cliente ni desde rutas que responden a peticiones de navegador con datos.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';

export function createServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada. Requerida para jobs de servidor.');
  }
  return createSupabaseClient(supabaseUrl, key, { auth: { persistSession: false } });
}

export function hayServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}