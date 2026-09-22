import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SERVICE_ROLE) {
  console.error('[sfbathroom-mcp] Falta SUPABASE_SERVICE_ROLE_KEY. Rellena mcp/.env o el env del cliente MCP.');
  process.exit(1);
}

/**
 * Cliente de propósito único para este MCP. Usa la service role key porque es
 * una herramienta de desarrollo de solo lectura gestionada por el propietario;
 * accede a todos los datos sin las restricciones de RLS de la app.
 */
export const supabase: SupabaseClient = createClient(URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-mcp': 'sfbathroom' } },
});