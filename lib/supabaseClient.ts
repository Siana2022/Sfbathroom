import { createClient } from '@supabase/supabase-js';

// Clave publicable (no es secreta): protegida por Row Level Security en Postgres.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

export const supabase = createClient(supabaseUrl, supabaseKey);
