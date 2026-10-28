/**
 * Tests de normalización de provincia. Ejecutar: npm test
 *
 * Lo que se comprueba: que un código INE se convierta en su nombre, que las
 * variantes que manda el ERP (mayúsculas, sin acentos, nombres viejos como
 * "Gerona") acaben en el mismo nombre canónico, y que un valor desconocido NO
 * se pierda: se devuelve tal cual en vez de dejarlo vacío.
 */
import { normalizarProvincia } from './provincias';

let fallos = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

comprobar('código INE 46 → Valencia', normalizarProvincia('46') === 'Valencia');
comprobar('código INE 8 → Barcelona', normalizarProvincia('8') === 'Barcelona');
comprobar('código INE 28 → Madrid', normalizarProvincia('28') === 'Madrid');
comprobar('código INE 1 → Álava', normalizarProvincia('1') === 'Álava');
comprobar('código INE 52 → Melilla', normalizarProvincia('52') === 'Melilla');
comprobar('código fuera de rango se deja igual', normalizarProvincia('99') === '99');

comprobar('nombre en mayúsculas', normalizarProvincia('VALENCIA') === 'Valencia');
comprobar('nombre con acento', normalizarProvincia('València') === 'Valencia');
comprobar('nombre sin acento', normalizarProvincia('Alava') === 'Álava');
comprobar('nombre viejo: Gerona', normalizarProvincia('Gerona') === 'Girona');
comprobar('nombre viejo: Lérida', normalizarProvincia('Lérida') === 'Lleida');
comprobar('nombre viejo: Vizcaya', normalizarProvincia('Vizcaya') === 'Bizkaia');
comprobar('nombre viejo: Guipúzcoa', normalizarProvincia('Guipúzcoa') === 'Gipuzkoa');
comprobar('nombre viejo: Orense', normalizarProvincia('Orense') === 'Ourense');
comprobar('bilingüe: Alicante/Alacant', normalizarProvincia('Alicante/Alacant') === 'Alicante');
comprobar('bilingüe: Castellón/Castelló', normalizarProvincia('Castellón/Castelló') === 'Castellón');
comprobar('bilingüe: Illes Balears', normalizarProvincia('ILLES BALEARS') === 'Illes Balears');
comprobar('con espacios de sobra', normalizarProvincia('  Madrid  ') === 'Madrid');
comprobar('nombres compuestos', normalizarProvincia('santa cruz de tenerife') === 'Santa Cruz de Tenerife');

comprobar('null → null', normalizarProvincia(null) === null);
comprobar('undefined → null', normalizarProvincia(undefined) === null);
comprobar('vacío → null', normalizarProvincia('   ') === null);

// Lo importante: no perder el dato. Mejor enseñar algo raro que nada.
comprobar('desconocido se devuelve tal cual', normalizarProvincia('PUZOL') === 'PUZOL');

// Dos formas del mismo sitio deben acabar en el mismo nombre, o filtrar por
// provincia partiría la cartera en dos.
const formas = ['46', 'Valencia', 'VALENCIA', 'valencia', 'València'];
comprobar(
  'todas las formas de Valencia coinciden',
  formas.every((f) => normalizarProvincia(f) === 'Valencia'),
  formas.map((f) => `${f}→${normalizarProvincia(f)}`).join(', '),
);

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s) en provincias.test.ts`);
  process.exit(1);
}
console.log('\nprovincias.test.ts OK');
