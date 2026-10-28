/**
 * Nombres de provincia. Puro, sin React ni Supabase.
 *
 * El ERP guarda la provincia en crudo (`PROVIFISCAL` en A3ERP), y según el
 * cliente y el año eso llega como código INE (`46`) o como nombre (`VALENCIA`).
 * La app mostraba el número tal cual. Aquí se traduce a un nombre canónico en
 * lectura, que es donde se puede corregir sin tocar la base.
 *
 * Un valor que no se reconoce se devuelve tal cual, nunca se descarta: es mejor
 * enseñar algo raro que ocultar el dato.
 */

/** Códigos INE de provincia (1–52). */
const POR_CODIGO: Record<number, string> = {
  1: 'Álava',
  2: 'Albacete',
  3: 'Alicante',
  4: 'Almería',
  5: 'Ávila',
  6: 'Badajoz',
  7: 'Illes Balears',
  8: 'Barcelona',
  9: 'Burgos',
  10: 'Cáceres',
  11: 'Cádiz',
  12: 'Castellón',
  13: 'Ciudad Real',
  14: 'Córdoba',
  15: 'A Coruña',
  16: 'Cuenca',
  17: 'Girona',
  18: 'Granada',
  19: 'Guadalajara',
  20: 'Gipuzkoa',
  21: 'Huelva',
  22: 'Huesca',
  23: 'Jaén',
  24: 'León',
  25: 'Lleida',
  26: 'La Rioja',
  27: 'Lugo',
  28: 'Madrid',
  29: 'Málaga',
  30: 'Murcia',
  31: 'Navarra',
  32: 'Ourense',
  33: 'Asturias',
  34: 'Palencia',
  35: 'Las Palmas',
  36: 'Pontevedra',
  37: 'Salamanca',
  38: 'Santa Cruz de Tenerife',
  39: 'Cantabria',
  40: 'Segovia',
  41: 'Sevilla',
  42: 'Soria',
  43: 'Tarragona',
  44: 'Teruel',
  45: 'Toledo',
  46: 'Valencia',
  47: 'Valladolid',
  48: 'Bizkaia',
  49: 'Zamora',
  50: 'Zaragoza',
  51: 'Ceuta',
  52: 'Melilla',
};

/** Quita acentos y pasa a minúsculas, para comparar nombres escritos de mil formas. */
function plegar(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Variantes hacia el nombre canónico: nombres viejos en castellano, formas
 * bilingües y erratas frecuentes del ERP. La clave va ya plegada.
 */
const ALIAS: Record<string, string> = {};
for (const nombre of Object.values(POR_CODIGO)) ALIAS[plegar(nombre)] = nombre;

const VARIANTES: Record<string, string> = {
  alava: 'Álava',
  araba: 'Álava',
  'la coruna': 'A Coruña',
  coruna: 'A Coruña',
  'a coruna': 'A Coruña',
  'la coruña': 'A Coruña',
  gerona: 'Girona',
  lerida: 'Lleida',
  guipuzcoa: 'Gipuzkoa',
  vizcaya: 'Bizkaia',
  baleares: 'Illes Balears',
  'islas baleares': 'Illes Balears',
  'illes balears': 'Illes Balears',
  'alicante/alacant': 'Alicante',
  alacant: 'Alicante',
  'valencia/valencia': 'Valencia',
  valència: 'Valencia',
  'castellon/castello': 'Castellón',
  castello: 'Castellón',
  'la rioja': 'La Rioja',
  rioja: 'La Rioja',
  navarra: 'Navarra',
  'comunidad de madrid': 'Madrid',
  madrid: 'Madrid',
  asturias: 'Asturias',
  'principado de asturias': 'Asturias',
  cantabria: 'Cantabria',
  murcia: 'Murcia',
  'region de murcia': 'Murcia',
  ourense: 'Ourense',
  orense: 'Ourense',
  'santa cruz de tenerife': 'Santa Cruz de Tenerife',
  tenerife: 'Santa Cruz de Tenerife',
  'las palmas': 'Las Palmas',
  'palmas, las': 'Las Palmas',
};
for (const [clave, canonico] of Object.entries(VARIANTES)) ALIAS[plegar(clave)] = canonico;

/**
 * Traduce el valor de provincia a un nombre legible.
 *
 * `null`/vacío se quedan como `null` (no se inventa provincia). Un código INE
 * se convierte en su nombre; un nombre se canonicaliza; lo que no se reconoce
 * se devuelve tal cual, recortado.
 */
export function normalizarProvincia(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (limpio === '') return null;

  if (/^\d{1,2}$/.test(limpio)) {
    const n = Number(limpio);
    return POR_CODIGO[n] ?? limpio;
  }

  return ALIAS[plegar(limpio)] ?? limpio;
}
