/**
 * Tests de orden por columnas de la cartera. Ejecutar: npm test
 *
 * Lo que se comprueba: que cada columna ordene de verdad, que pinchar dos veces
 * invierta la dirección, que los huecos (sin provincia, sin pedidos) NO encabecen
 * la lista, y que una columna desconocida en la URL no rompa sino que caiga al
 * orden por defecto.
 */
import {
  alternarOrden,
  normalizarOrden,
  ordenarCartera,
  type FilaOrdenable,
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
  opts: Partial<FilaOrdenable> = {},
): FilaOrdenable {
  return {
    cliente,
    provincia: 'Valencia',
    pais: 'España',
    estadoCrm: 'habitual',
    cadenciaDias: 30,
    diasSinPedir: 10,
    pedidosPeriodo: 1,
    importePeriodo: 1000,
    contactos: 1,
    ...opts,
  };
}

const muestra: FilaOrdenable[] = [
  fila('Zeta Baños', { provincia: 'Madrid', cadenciaDias: 60, diasSinPedir: 90, pedidosPeriodo: 2, importePeriodo: 500, contactos: 3, estadoCrm: 'perdido' }),
  fila('Alfa Sanitarios', { provincia: null, cadenciaDias: 15, diasSinPedir: 5, pedidosPeriodo: 9, importePeriodo: 9000, contactos: 1, estadoCrm: 'nuevo' }),
  fila('Media Grifos', { provincia: 'Barcelona', cadenciaDias: 30, diasSinPedir: null, pedidosPeriodo: 0, importePeriodo: 0, contactos: 0, estadoCrm: null }),
];

const nombres = (filas: FilaOrdenable[]) => filas.map((f) => f.cliente).join(', ');

// --- Lectura del orden desde la URL ---
comprobar('sin orden → null (se usa el de urgencia)', normalizarOrden(undefined, undefined) === null);
comprobar('columna desconocida → null', normalizarOrden('inventada', 'asc') === null);
comprobar('columna válida sin dir usa su natural', normalizarOrden('cliente', undefined)?.direccion === 'asc');
comprobar('numérica sin dir empieza descendente', normalizarOrden('importePeriodo', undefined)?.direccion === 'desc');
comprobar('dir explícita se respeta', normalizarOrden('cliente', 'desc')?.direccion === 'desc');
comprobar('dir basura cae a la natural', normalizarOrden('cliente', 'zzz')?.direccion === 'asc');

// --- Alternar al pinchar ---
comprobar('pinchar una columna nueva estrena dirección natural', alternarOrden(null, 'cliente').direccion === 'asc');
comprobar('pinchar la misma invierte', alternarOrden({ columna: 'cliente', direccion: 'asc' }, 'cliente').direccion === 'desc');
comprobar('pinchar la misma invierte al revés', alternarOrden({ columna: 'cliente', direccion: 'desc' }, 'cliente').direccion === 'asc');
comprobar('cambiar de columna no arrastra la dirección', alternarOrden({ columna: 'cliente', direccion: 'asc' }, 'importePeriodo').direccion === 'desc');

// --- Orden real por cada columna ---
comprobar('por cliente A→Z', nombres(ordenarCartera(muestra, { columna: 'cliente', direccion: 'asc' })) === 'Alfa Sanitarios, Media Grifos, Zeta Baños', nombres(ordenarCartera(muestra, { columna: 'cliente', direccion: 'asc' })));
comprobar('por cliente Z→A', nombres(ordenarCartera(muestra, { columna: 'cliente', direccion: 'desc' })) === 'Zeta Baños, Media Grifos, Alfa Sanitarios');

// Sin provincia va al final, no encabeza.
const porProvincia = ordenarCartera(muestra, { columna: 'provincia', direccion: 'asc' });
comprobar('por provincia: nombres primero, hueco al final', porProvincia[0].provincia === 'Barcelona' && porProvincia[2].provincia === null, nombres(porProvincia));
const porProvinciaDesc = ordenarCartera(muestra, { columna: 'provincia', direccion: 'desc' });
comprobar('por provincia desc: el hueco sigue al final', porProvinciaDesc[2].provincia === null, nombres(porProvinciaDesc));

comprobar('por días sin pedir desc', ordenarCartera(muestra, { columna: 'diasSinPedir', direccion: 'desc' })[0].cliente === 'Zeta Baños');
comprobar('por días sin pedir: sin pedidos al final', ordenarCartera(muestra, { columna: 'diasSinPedir', direccion: 'desc' })[2].cliente === 'Media Grifos');
comprobar('sin pedidos sigue al final en asc', ordenarCartera(muestra, { columna: 'diasSinPedir', direccion: 'asc' })[2].cliente === 'Media Grifos');
comprobar('por cadencia asc', ordenarCartera(muestra, { columna: 'cadencia', direccion: 'asc' })[0].cliente === 'Alfa Sanitarios');
comprobar('por pedidos desc', ordenarCartera(muestra, { columna: 'pedidosPeriodo', direccion: 'desc' })[0].cliente === 'Alfa Sanitarios');
comprobar('por importe desc', ordenarCartera(muestra, { columna: 'importePeriodo', direccion: 'desc' })[0].importePeriodo === 9000);
comprobar('por contactos desc', ordenarCartera(muestra, { columna: 'contactos', direccion: 'desc' })[0].contactos === 3);

// Estado sigue el orden del desplegable: habitual, nuevo, seguimiento, ganado, perdido.
const porEstado = ordenarCartera(muestra, { columna: 'estado', direccion: 'asc' });
comprobar('por estado: nuevo antes que perdido', porEstado[0].estadoCrm === 'nuevo' && porEstado[1].estadoCrm === 'perdido', nombres(porEstado));
comprobar('por estado: sin estado al final', porEstado[2].estadoCrm === null, nombres(porEstado));

// --- No muta la entrada ---
const copia = [...muestra];
ordenarCartera(muestra, { columna: 'cliente', direccion: 'asc' });
comprobar('no muta el array original', nombres(muestra) === nombres(copia));

// --- Estable: los empates conservan el orden de entrada ---
const empate = [fila('B', { importePeriodo: 100 }), fila('A', { importePeriodo: 100 }), fila('C', { importePeriodo: 100 })];
comprobar('empate conserva el orden de entrada', nombres(ordenarCartera(empate, { columna: 'importePeriodo', direccion: 'desc' })) === 'B, A, C');

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s) en carteraOrden.test.ts`);
  process.exit(1);
}
console.log('\ncarteraOrden.test.ts OK');
