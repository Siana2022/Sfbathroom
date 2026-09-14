import { createClient } from '@/lib/supabase/server';

type Preferencias = Record<string, unknown>;

export async function getPrefs(): Promise<Preferencias> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase
    .from('preferencias_usuario')
    .select('prefs')
    .eq('usuario_id', user.id)
    .maybeSingle();
  return (data?.prefs as Preferencias) ?? {};
}

export async function setPrefs(patch: Record<string, unknown>): Promise<Preferencias> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: existente } = await supabase
    .from('preferencias_usuario')
    .select('prefs')
    .eq('usuario_id', user.id)
    .maybeSingle();

  const merged = { ...((existente?.prefs as Preferencias) ?? {}), ...patch };
  const { error } = await supabase
    .from('preferencias_usuario')
    .upsert({ usuario_id: user.id, prefs: merged, updated_at: new Date().toISOString() }, { onConflict: 'usuario_id' });
  if (error) throw error;
  return merged;
}