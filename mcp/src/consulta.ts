import { supabase } from './entorno.js';

/** Redondea a 2 decimales para respuestas compactas. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Error controlado para devolver un mensaje claro a Claude y no un crash. */
export class DatosError extends Error {}

/**
 * Trocea un .in() en bloques para no superar los límites de PostgREST
 * (parejo a lib/datos/lineas.ts de la app).
 */
export async function inTroceado<T>(
  tabla: string,
  columna: string,
  ids: string[],
  seleccion: string,
): Promise<T[]> {
  const listas = ids.reduce<string[][]>((acc, id, i) => {
    const idx = Math.floor(i / 150);
    if (!acc[idx]) acc[idx] = [];
    acc[idx].push(id);
    return acc;
  }, []);
  const resultados: T[] = [];
  for (const lote of listas) {
    const { data, error } = await supabase.from(tabla).select(seleccion).in(columna, lote);
    if (error) throw new DatosError(`Error consultando ${tabla}: ${error.message}`);
    resultados.push(...((data ?? []) as T[]));
  }
  return resultados;
}

/** Resuelve el id de una empresa por código (SF, DOT, FUX…). */
export async function empresaDe(codigo: string): Promise<string> {
  const { data, error } = await supabase
    .from('empresas')
    .select('id, codigo, nombre')
    .eq('codigo', codigo?.toUpperCase().trim())
    .maybeSingle();
  if (error) throw new DatosError(`Error consultando la empresa: ${error.message}`);
  if (!data) {
    const { data: lista } = await supabase.from('empresas').select('codigo');
    const disponibles = (lista ?? []).map((e) => e.codigo).join(', ');
    throw new DatosError(`Empresa "${codigo}" no encontrada. Códigos disponibles: ${disponibles}`);
  }
  return data.id as string;
}