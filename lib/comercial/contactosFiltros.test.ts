/**
 * Tests del filtrado de contactos (base de los envíos masivos). Módulo puro:
 * no necesita Supabase. Ejecutar: compilar con tsc y correr con node.
 */
import {
  filtrarContactos,
  hayFiltrosContactos,
  normalizarFiltrosContactos,
  opcionesTerritorio,
  type ContactoFiltrable,
} from './contactosFiltros';

let fallos = 0;
function comprobar(nombre: string, cond: boolean, detalle = '') {
  if (cond) console.log(`  ok  ${nombre}`);
  else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

const c = (
  nombre: string,
  opts: Partial<ContactoFiltrable> = {},
): ContactoFiltrable => ({
  cliente: 'Cliente',
  nombre,
  apellidos: null,
  cargo: null,
  email: null,
  pais: null,
  provincia: null,
  ...opts,
});

console.log('filtrado de contactos');

{
  const filas = [c('Ana', { apellidos: 'Ruiz', pais: 'España', provincia: 'Valencia', email: 'a@x.es' }), c('Luis', { pais: 'Francia', email: null })];
  const solo = filtrarContactos(filas, { sinEmail: true });
  comprobar('sinEmail deja solo los que no tienen correo', solo.length === 1 && solo[0].nombre === 'Luis');
}

{
  const filas = [c('Ana', { provincia: 'Valencia' }), c('Luis', { provincia: null })];
  const v = filtrarContactos(filas, { provincia: 'Valencia' });
  comprobar('provincia no captura a quien no la tiene', v.length === 1 && v[0].nombre === 'Ana');
}

{
  const filas = [c('Ana', { apellidos: 'Ruiz', cargo: 'Compras' }), c('Luis', { cargo: 'Almacén' })];
  comprobar('busca por cargo', filtrarContactos(filas, { texto: 'compras' }).length === 1);
  comprobar('busca por apellido, sin distinguir mayúsculas', filtrarContactos(filas, { texto: 'RUIZ' }).length === 1);
  comprobar('texto que no está no devuelve nada', filtrarContactos(filas, { texto: 'zzz' }).length === 0);
}

{
  const filas = [c('Ana', { pais: 'España', provincia: 'Valencia' }), c('Luis', { pais: 'España', provincia: 'Madrid' }), c('Eva', { pais: 'Francia', provincia: 'Valencia' })];
  const o = filtrarContactos(filas, { pais: 'España', provincia: 'Valencia' });
  comprobar('país y provincia se combinan', o.length === 1 && o[0].nombre === 'Ana');
}

{
  const op = opcionesTerritorio([c('a', { pais: 'España' }), c('b', { pais: 'España' }), c('c', { pais: 'Francia' }), c('d', { pais: null })], 'pais');
  comprobar('opciones ordenadas por recuento y sin nulos', op.length === 2 && op[0].valor === 'España' && op[0].n === 2);
}

{
  comprobar('normalizar: valores vacíos no son filtro', !hayFiltrosContactos(normalizarFiltrosContactos({ q: '   ', pais: '' })));
  comprobar('normalizar: sinEmail solo con "1"', normalizarFiltrosContactos({ sinEmail: '1' }).sinEmail === true && normalizarFiltrosContactos({ sinEmail: '0' }).sinEmail === false);
  comprobar('normalizar: recorta espacios del texto', normalizarFiltrosContactos({ q: '  ana  ' }).texto === 'ana');
}

if (fallos > 0) {
  console.error(`\n${fallos} FALLO(S) en contactosFiltros`);
  process.exit(1);
}
console.log('contactosFiltros OK');
