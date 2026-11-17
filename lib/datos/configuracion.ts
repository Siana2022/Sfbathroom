import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { esComercialValido } from '@/lib/datos/filtros';

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

export type ObjetivoComercial = { comercialId: string; nombre: string; importe: number };

export async function getObjetivosComercial(
  codigoEmpresa: string,
  anio: number,
): Promise<{ empresaId: string; anio: number; filas: ObjetivoComercial[] }> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const [{ data: comerciales }, { data: objetivos }] = await Promise.all([
    supabase.from('comerciales').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('objetivos_comercial')
      .select('comercial_id, importe')
      .eq('empresa_id', empresa.id)
      .eq('anio', anio),
  ]);
  const porComercial = new Map<string, number>();
  for (const o of (objetivos ?? []) as { comercial_id: string; importe: number }[]) {
    porComercial.set(o.comercial_id, Number(o.importe ?? 0));
  }
  const filas = ((comerciales ?? []) as { id: string; nombre: string }[])
    .filter((c) => esComercialValido(c.nombre))
    .map((c) => ({ comercialId: c.id, nombre: c.nombre, importe: porComercial.get(c.id) ?? 0 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { empresaId: empresa.id, anio, filas };
}
