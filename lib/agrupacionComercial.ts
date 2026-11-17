/**
 * Agrupación de comerciales por cabecera (STARBATH y BIGMAT).
 *
 * Los nombres de A3ERP llegan como "Nombre - SUFIJO" o "SUFIJO - Nombre".
 * Cuando el nombre contiene STARBATH o BIGMAT se usa ese token como cabecera y
 * el resto como sección. Si no, se mantiene la regla anterior: si el sufijo
 * " - X" se repite en varios comerciales, X pasa a ser la cabecera.
 */

export const TOKENS_GRUPO_COMERCIAL = ['STARBATH', 'BIGMAT'];

/** Comerciales que se agrupan bajo una cabecera aunque no la lleven en el nombre. */
const ALIAS_GRUPO: Record<string, string> = {
  'JUAN ORTEGA': 'STARBATH',
};

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

/** ¿Este comercial pertenece a la marca STARBATH? */
export function esMarcaStarbath(nombre: string): boolean {
  const n = sinTildes(nombre);
  return n.includes('STARBATH') || ALIAS_GRUPO[n] === 'STARBATH';
}

export function grupoComercial(
  nombre: string,
  sufijos: Map<string, number>,
): { base: string; seccion: string | null } {
  const alias = ALIAS_GRUPO[sinTildes(nombre)];
  if (alias) return { base: alias, seccion: nombre };

  const up = nombre.toUpperCase();
  for (const token of TOKENS_GRUPO_COMERCIAL) {
    if (up.includes(token)) {
      const resto = nombre
        .replace(new RegExp(token, 'ig'), '')
        .replace(/^[\s\-–—|/]+|[\s\-–—|/]+$/g, '')
        .trim();
      return { base: token, seccion: resto === '' ? null : resto };
    }
  }
  const i = nombre.indexOf(' - ');
  if (i > 0) {
    const sufijo = nombre.slice(i + 3).trim();
    if ((sufijos.get(sufijo) ?? 0) > 1) return { base: sufijo, seccion: nombre.slice(0, i).trim() };
  }
  return { base: nombre, seccion: null };
}

/** Cuenta cuántas veces aparece cada sufijo " - X" para decidir la cabecera. */
export function contarSufijos(nombres: string[]): Map<string, number> {
  const sufijos = new Map<string, number>();
  for (const nombre of nombres) {
    const i = nombre.indexOf(' - ');
    if (i > 0) {
      const sufijo = nombre.slice(i + 3).trim();
      sufijos.set(sufijo, (sufijos.get(sufijo) ?? 0) + 1);
    }
  }
  return sufijos;
}
