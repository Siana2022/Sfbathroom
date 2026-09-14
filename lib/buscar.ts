/**
 * Sanea un término de búsqueda para usarlo como valor de un filtro PostgREST
 * `.or(...)`/`.ilike(...)`:
 * - Las comas separan condiciones dentro de .or() → se quitan.
 * - Los metacaracteres de la lógica de filtros ( . * + ? ^ $ { } ( ) | [ ] \ )
 *   se escapan.
 * - % y _ son comodines de LIKE → se escapan para tratarlos como literales.
 * - Se normaliza el espacio en blanco.
 */
export function sanearTermino(q: string): string {
  return q
    .replace(/,/g, ' ')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\s+/g, ' ')
    .trim();
}