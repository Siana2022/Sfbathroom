/**
 * Tests de filtrado y paginación de cartera. Ejecutar: npm test
 *
 * Lo que se comprueba: que los filtros no inventen pertenencias territoriales
 * (un cliente sin provincia no está "en Valencia"), que paginar nunca deje la
 * vista vacía por una página fuera de rango, y que los desplegables cuenten
 * sobre lo que hay.
 */
import {
  filtrarCartera,
  hayFiltros,
  normalizarFiltros,
  normalizarPagina,
  opcionesDe,
  paginar,
  POR_PAGINA,
  type FilaFiltrable,
} from './carteraFiltros';

let fallos = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

function fila(
  cliente: string,
  provincia: string | null,
  pais: string | null,
  estadoCrm: FilaFiltrable['estadoCrm'] = null,
): FilaFiltrable {
  return { cliente, provincia, pais, estadoCrm };
}

const muestra: FilaFiltrable[] = [
  fila('Baños Mediterráneo', 'Valencia', 'España', 'habitual'),
  fila('Cerámicas Norte', 'Alicante', 'España', 'seguimiento'),
  fila('Reformas Levante', 'Valencia', 'España', 'habitual'),
  fila('Bañomarket SL', 'Madrid', 'España', 'nuevo'),
  fila('Griferías Duero', 'Valladolid', 'España', 'nuevo'),
  fila('Sanitarios Bravo', 'Barcelona', 'España', 'perdido'),
  fila('Azulejos Penedès', 'Barcelona', 'España', 'habitual'),
  fila('Hogar y Obra', 'Madrid', 'España', 'ganado'),
  fila('Sin Datos SA', null, null, null),
  fila('Luso Bath', 'Braga', 'Portugal', 'seguimiento'),
];

console.log('cartera · normalización de filtros');

{
  comprobar('sin params → sin filtros', !hayFiltros(normalizarFiltros({})));
  comprobar('cadena vacía no filtra', !hayFiltros(normalizarFiltros({ provincia: '' })));
  comprobar('solo espacios no filtra', !hayFiltros(normalizarFiltros({ provincia: '   ' })));
  comprobar('array vacío no filtra', !hayFiltros(normalizarFiltros({ provincia: [] })));
  comprobar('valor real sí filtra', hayFiltros(normalizarFiltros({ provincia: 'Valencia' })));
  comprobar('estado inválido se descarta', !hayFiltros(normalizarFiltros({ estado: 'inventado' })));
  comprobar('estado válido se acepta', hayFiltros(normalizarFiltros({ estado: 'ganado' })));
  comprobar('recorta espacios', normalizarFiltros({ cliente: '  Baños  ' }).cliente === 'Baños');
}

console.log('cartera · filtrado');

{
  comprobar('sin filtros devuelve todo', filtrarCartera(muestra, {}).length === 10);
  comprobar('por provincia', filtrarCartera(muestra, { provincia: 'Valencia' }).length === 2);
  comprobar('por provincia sin coincidencias', filtrarCartera(muestra, { provincia: 'Huesca' }).length === 0);
  comprobar('por país', filtrarCartera(muestra, { pais: 'Portugal' }).length === 1);

  // Lo importante: quien no tiene provincia NO está en Valencia.
  const valencia = filtrarCartera(muestra, { provincia: 'Valencia' });
  comprobar('sin provincia no entra en un filtro provincial', !valencia.some((f) => f.cliente === 'Sin Datos SA'));
  const portugal = filtrarCartera(muestra, { pais: 'Portugal' });
  comprobar('sin país no entra en un filtro de país', !portugal.some((f) => f.cliente === 'Sin Datos SA'));

  // Búsqueda por nombre, insensible a mayúsculas y acentos de teclado.
  comprobar('búsqueda por subcadena', filtrarCartera(muestra, { cliente: 'baños' }).length === 1);
  comprobar('búsqueda case-insensitive', filtrarCartera(muestra, { cliente: 'BAÑOS' }).length === 1);
  comprobar('búsqueda parcial', filtrarCartera(muestra, { cliente: 'ba' }).length === 3, 'Baños, Bañomarket, Luso Bath');

  comprobar('por estado CRM', filtrarCartera(muestra, { estadoCrm: 'nuevo' }).length === 2);
  comprobar('perdido', filtrarCartera(muestra, { estadoCrm: 'perdido' }).length === 1);
  comprobar('estado sin clientes', filtrarCartera(muestra, { estadoCrm: 'ganado' }).length === 1);

  // Combinado: los filtros se suman, no se sustituyen.
  const combo = filtrarCartera(muestra, { provincia: 'Madrid', estadoCrm: 'nuevo' });
  comprobar('combinado provincia+estado', combo.length === 1 && combo[0].cliente === 'Bañomarket SL');
  const combo2 = filtrarCartera(muestra, { pais: 'España', provincia: 'Barcelona', estadoCrm: 'habitual' });
  comprobar('combinado triple', combo2.length === 1 && combo2[0].cliente === 'Azulejos Penedès');
}

console.log('cartera · paginación');

{
  const filas = Array.from({ length: 128 }, (_, i) => fila(`Cliente ${i + 1}`, 'Valencia', 'España'));

  const p1 = paginar(filas, 1);
  comprobar('página 1 trae 50', p1.filas.length === POR_PAGINA);
  comprobar('página 1 empieza en Cliente 1', p1.filas[0].cliente === 'Cliente 1');
  comprobar('total 128', p1.total === 128);
  comprobar('3 páginas', p1.totalPaginas === 3, `dio ${p1.totalPaginas}`);
  comprobar('rango mostrado 1–50', p1.desde === 1 && p1.hasta === 50, `${p1.desde}-${p1.hasta}`);

  const p3 = paginar(filas, 3);
  comprobar('página 3 trae 28', p3.filas.length === 28, `dio ${p3.filas.length}`);
  comprobar('página 3 termina en 128', p3.hasta === 128);
  comprobar('página 3 es la última', p3.pagina === 3);

  // Una página fuera de rango no debe devolver vacío: parecería que no hay
  // clientes. Se devuelve la última válida.
  const p99 = paginar(filas, 99);
  comprobar('página 99 se ajusta a la 3', p99.pagina === 3, `dio ${p99.pagina}`);
  comprobar('página 99 no viene vacía', p99.filas.length === 28);

  const p0 = paginar(filas, 0);
  comprobar('página 0 se ajusta a la 1', p0.pagina === 1);
  const pNeg = paginar(filas, -5);
  comprobar('página negativa se ajusta a la 1', pNeg.pagina === 1);

  // Lista vacía: 1 página, sin filas, sin romper.
  const vacia = paginar([], 1);
  comprobar('lista vacía → 1 página', vacia.totalPaginas === 1);
  comprobar('lista vacía → 0 filas', vacia.filas.length === 0);
  comprobar('lista vacía → rango 0–0', vacia.desde === 0 && vacia.hasta === 0);

  // Justo en el límite: 50 filas son una página, no dos.
  const justas = paginar(Array.from({ length: 50 }, (_, i) => fila(`C${i}`, null, null)), 1);
  comprobar('50 filas → 1 página', justas.totalPaginas === 1);
  const cincuentaYUno = paginar(Array.from({ length: 51 }, (_, i) => fila(`C${i}`, null, null)), 1);
  comprobar('51 filas → 2 páginas', cincuentaYUno.totalPaginas === 2);

  // Paginar después de filtrar: el filtro manda, la página se ajusta.
  const filtradas = filtrarCartera(filas, { cliente: 'Cliente 1' }); // 1,10-19,100-128...
  const pf = paginar(filtradas, 99);
  comprobar('tras filtrar, página se ajusta', pf.pagina === pf.totalPaginas);
  comprobar('tras filtrar, hay filas', pf.filas.length > 0);
}

console.log('cartera · número de página desde la URL');

{
  comprobar('sin valor → 1', normalizarPagina(undefined) === 1);
  comprobar('vacío → 1', normalizarPagina('') === 1);
  comprobar('"2" → 2', normalizarPagina('2') === 2);
  comprobar('basura → 1', normalizarPagina('abc') === 1);
  comprobar('negativo → 1', normalizarPagina('-3') === 1);
  comprobar('cero → 1', normalizarPagina('0') === 1);
  comprobar('decimal se trunca', normalizarPagina('2.9') === 2);
  comprobar('array → 1', normalizarPagina(['2', '3']) === 1);
}

console.log('cartera · opciones de los desplegables');

{
  const prov = opcionesDe(muestra, 'provincia');
  comprobar('provincias únicas', prov.length === 6, `dio ${prov.length}`);
  // Hay empate a 2 entre Barcelona, Madrid y Valencia; el desempate es
  // alfabético, así que la primera es Barcelona.
  comprobar('la más frecuente primero', prov[0].n === 2 && prov[0].valor === 'Barcelona', `dio ${prov[0].valor} (${prov[0].n})`);
  comprobar('los empates van en orden alfabético', prov.slice(0, 3).map((p) => p.valor).join(',') === 'Barcelona,Madrid,Valencia');
  comprobar('las de n=1 van después', prov.slice(3).every((p) => p.n === 1));
  comprobar('excluye nulos', !prov.some((p) => p.valor === ''));
  const pais = opcionesDe(muestra, 'pais');
  comprobar('países únicos', pais.length === 2);
  comprobar('España primero', pais[0].valor === 'España' && pais[0].n === 8);
}

if (fallos === 0) console.log('\nTODO OK');
else {
  console.error(`\n${fallos} FALLOS`);
  process.exit(1);
}
