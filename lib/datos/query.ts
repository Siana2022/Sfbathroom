/**
 * Helpers genéricos para consultas que escalan con datos reales (A3ERP).
 *
 * Motivo: PostgREST envía los filtros `.in(col, [...])` en la URL (GET) y limita a
 * 1000 filas por petición por defecto. Con datos demo ningún lote supera esos
 * límites; con datos reales (miles de facturas / pedidos / compras) la URL revienta
 * y PostgREST devuelve vacío en silencio → agregados a 0 (unidades, "líneas",
 * precio/volumen/mix, etc.). Trocear y paginar evita ambos límites sin tocar la
 * RLS (se usa el mismo cliente que la app).
 */

/** Nº de valores por `.in(...)` para que la URL no supere el límite del gateway. */
export const TAMANO_LOTE = 150;

/** Nº de filas por página para saltar el límite de 1000 de PostgREST. */
export const TAMANO_PAGINA = 1000;

/**
 * Ejecuta un fetch por lotes de `valores`. `fetchLote` recibe un lote (≤
 * TAMANO_LOTE valores) y debe devolver la promesa de una consulta ya configurada
 * con su `.in(col, lote)`. Devuelve solo el array de filas.
 */
export async function enLotes<T>(
  fetchLote: (lote: string[]) => PromiseLike<{ data: T[] | null }> | PromiseLike<any>,
  valores: string[],
): Promise<T[]> {
  if (!valores.length) return [];
  const salida: T[] = [];
  for (let i = 0; i < valores.length; i += TAMANO_LOTE) {
    const lote = valores.slice(i, i + TAMANO_LOTE);
    const { data } = await fetchLote(lote);
    if (data) salida.push(...(data as T[]));
  }
  return salida;
}

/**
 * Recolecta todas las filas de un select que puede superar el límite de 1000 de
 * PostgREST. `fetchPagina` recibe el offset y debe devolver la consulta ya
 * configurada con `.range(desde, desde + TAMANO_PAGINA - 1)`.
 */
export async function todasLasFilas<T>(
  fetchPagina: (desde: number) => PromiseLike<{ data: T[] | null }> | PromiseLike<any>,
): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data } = await fetchPagina(desde);
    if (!data) break;
    salida.push(...(data as T[]));
    if (data.length < TAMANO_PAGINA) break;
  }
  return salida;
}