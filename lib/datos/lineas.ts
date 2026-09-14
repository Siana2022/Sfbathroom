import type { createClient } from '@/lib/supabase/server';

/**
 * Lee filas de `factura_lineas` para un conjunto de IDs de factura, troceando
 * el `.in(...)` en lotes.
 *
 * Motivo: PostgREST envía el filtro `.in('factura_id', [...])` en la URL (GET).
 * Con cientos de UUID la URL supera el límite del gateway y la petición falla
 * en silencio (data = null) → agregados a 0 (p. ej. "unidades = 0"). Con datos
 * reales de A3ERP (miles de facturas) el fallo es sistemático. Trocear evita
 * URLs gigantes y mantiene la RLS del usuario (se usa el mismo cliente).
 */
const TAMANO_LOTE = 150;

export async function lineasPorFacturas<T = Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  columnas: string,
  ids: string[],
): Promise<T[]> {
  if (!ids.length) return [];
  const salida: T[] = [];
  for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
    const lote = ids.slice(i, i + TAMANO_LOTE);
    const { data } = await supabase.from('factura_lineas').select(columnas).in('factura_id', lote);
    if (data) salida.push(...(data as T[]));
  }
  return salida;
}
