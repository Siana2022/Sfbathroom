import { createClient } from '@/lib/supabase/server';

export type UmbralConfig = {
  id: string;
  modulo: string;
  nombre: string;
  umbral: number | null;
  unidad: string | null;
  activo: boolean;
};

export async function getConfiguracionUmbrales(): Promise<UmbralConfig[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('alertas_config')
    .select('id, modulo, nombre, umbral, unidad, activo')
    .order('modulo');
  return (data ?? []) as UmbralConfig[];
}

export type ConfiguracionData = {
  rol: string | null;
  puedesEditar: boolean;
  umbrales: UmbralConfig[];
};

export async function getConfiguracion(): Promise<ConfiguracionData> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  let rol: string | null = null;
  if (userData.user) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    rol = (perfil as { role: string | null } | null)?.role ?? null;
  }
  return {
    rol,
    puedesEditar: rol === 'admin' || rol === 'direccion',
    umbrales: await getConfiguracionUmbrales(),
  };
}