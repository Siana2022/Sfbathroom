/**
 * Tests del filtrado y agrupación de la agenda. Ejecutar: npm test
 *
 * Lo que se comprueba: que las cuentas de los filtros no dependan del filtro
 * activo (para que el comercial vea la magnitud de lo que oculta) y que una
 * reunión sin modalidad no se cuele en un filtro concreto.
 */
import {
  agruparPorEstado,
  contarPorColumna,
  contarPorModalidad,
  filtrarPorModalidad,
  normalizarFiltroModalidad,
  ventanaAgenda,
  type ColumnasAgenda,
} from './agenda';
import type { ReunionConContexto } from './tipos';

let fallos = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

function reu(
  id: string,
  estado: ReunionConContexto['estado'],
  modalidad: ReunionConContexto['modalidad'],
): ReunionConContexto {
  return {
    id,
    cliente_id: 'c1',
    contacto_id: null,
    comercial_id: null,
    usuario_id: null,
    fecha_hora: '2026-10-29T09:00:00Z',
    duracion_min: 60,
    asunto: id,
    modalidad,
    estado,
    notas: null,
    interaccion_id: null,
    created_at: '2026-10-01T00:00:00Z',
    cliente: 'Baños Mediterráneo',
    contacto: null,
    comercial: null,
  };
}

console.log('agenda · agrupación');

const muestra: ReunionConContexto[] = [
  reu('p1', 'programada', 'presencial'),
  reu('p2', 'programada', 'telefono'),
  reu('p3', 'programada', 'videollamada'),
  reu('p4', 'programada', null),
  reu('r1', 'realizada', 'presencial'),
  reu('c1', 'cancelada', 'telefono'),
];

{
  const cols = agruparPorEstado(muestra);
  comprobar('programadas: 4', cols.programada.length === 4, `dio ${cols.programada.length}`);
  comprobar('realizadas: 1', cols.realizada.length === 1, `dio ${cols.realizada.length}`);
  comprobar('canceladas: 1', cols.cancelada.length === 1, `dio ${cols.cancelada.length}`);
  comprobar(
    'se conservan todas: 6',
    cols.programada.length + cols.realizada.length + cols.cancelada.length === muestra.length,
  );
}

{
  const cols = agruparPorEstado([]);
  comprobar('sin reuniones: columnas vacías', cols.programada.length === 0 && cols.realizada.length === 0);
}

console.log('agenda · filtro de modalidad');

{
  const p = filtrarPorModalidad(muestra, 'presencial');
  comprobar('presencial: 2', p.length === 2, `dio ${p.length}`);
  comprobar('presencial: solo presenciales', p.every((r) => r.modalidad === 'presencial'));
}

{
  const todas = filtrarPorModalidad(muestra, 'todas');
  comprobar('todas: no filtra nada', todas.length === muestra.length, `dio ${todas.length}`);
}

{
  const p = filtrarPorModalidad(muestra, 'telefono');
  comprobar('sin modalidad no entra en un filtro concreto', !p.some((r) => r.modalidad === null));
}

{
  const p = filtrarPorModalidad([], 'presencial');
  comprobar('lista vacía: sigue vacía', p.length === 0);
}

{
  // El filtro no debe mutar la entrada: se reutiliza la misma lista en el tablero.
  const copia = [...muestra];
  filtrarPorModalidad(muestra, 'presencial');
  comprobar('no muta la entrada', muestra.length === copia.length && muestra.every((r, i) => r.id === copia[i].id));
}

console.log('agenda · cuentas');

{
  const cuenta = contarPorModalidad(muestra);
  comprobar('total: 6', cuenta.todas === 6, `dio ${cuenta.todas}`);
  comprobar('presencial: 2', cuenta.presencial === 2, `dio ${cuenta.presencial}`);
  comprobar('telefono: 2', cuenta.telefono === 2, `dio ${cuenta.telefono}`);
  comprobar('videollamada: 1', cuenta.videollamada === 1, `dio ${cuenta.videollamada}`);
  comprobar(
    'la suma de modalidades no supera el total (la sin modalidad no cuenta)',
    cuenta.presencial + cuenta.telefono + cuenta.videollamada === 5,
  );
}

{
  // La cuenta NO depende del filtro: es lo que permite ver cuánto se está ocultando.
  const cols = agruparPorEstado(muestra);
  const conFiltro = contarPorColumna(cols, 'telefono');
  comprobar('columna programada con filtro teléfono: 1', conFiltro.programada === 1, `dio ${conFiltro.programada}`);
  comprobar('columna realizada con filtro teléfono: 0', conFiltro.realizada === 0, `dio ${conFiltro.realizada}`);
  comprobar('columna cancelada con filtro teléfono: 1', conFiltro.cancelada === 1, `dio ${conFiltro.cancelada}`);

  const sinFiltro = contarPorColumna(cols, 'todas');
  comprobar('sin filtro: programada 4', sinFiltro.programada === 4, `dio ${sinFiltro.programada}`);
  comprobar(
    'la cuenta por columna sí cambia con el filtro (a diferencia de la de modalidad)',
    sinFiltro.programada !== conFiltro.programada,
  );
}

{
  const vacias: ColumnasAgenda = { programada: [], realizada: [], cancelada: [] };
  const c = contarPorColumna(vacias, 'todas');
  comprobar('columnas vacías: todo a 0', c.programada === 0 && c.realizada === 0 && c.cancelada === 0);
}

console.log('agenda · normalizar filtro de URL');

{
  comprobar('sin parámetro: todas', normalizarFiltroModalidad(undefined) === 'todas');
  comprobar('cadena vacía: todas', normalizarFiltroModalidad('') === 'todas');
  comprobar('modalidad válida: se respeta', normalizarFiltroModalidad('telefono') === 'telefono');
  comprobar('valor inventado: todas', normalizarFiltroModalidad('paloma') === 'todas');
  comprobar('intento de inyección: todas', normalizarFiltroModalidad("' or 1=1--") === 'todas');
  comprobar('parámetro repetido: usa el primero', normalizarFiltroModalidad(['presencial', 'telefono']) === 'presencial');
  comprobar('mayúsculas: no cuela', normalizarFiltroModalidad('Presencial') === 'todas');
}

console.log('agenda · orden de las columnas');

{
  const a = reu('a', 'programada', 'presencial');
  a.fecha_hora = '2026-11-10T09:00:00Z';
  const b = reu('b', 'programada', 'presencial');
  b.fecha_hora = '2026-10-29T09:00:00Z';
  const cols = agruparPorEstado([a, b]);
  comprobar('programadas: la más próxima primero', cols.programada[0].id === 'b', `dio ${cols.programada[0].id}`);

  const r1 = reu('r1', 'realizada', 'presencial');
  r1.fecha_hora = '2026-01-05T09:00:00Z';
  const r2 = reu('r2', 'realizada', 'presencial');
  r2.fecha_hora = '2026-09-05T09:00:00Z';
  const cols2 = agruparPorEstado([r1, r2]);
  comprobar('realizadas: la más reciente primero', cols2.realizada[0].id === 'r2', `dio ${cols2.realizada[0].id}`);
}

console.log('agenda · ventana de carga');

{
  const hoy = new Date('2026-10-23T12:00:00Z');
  const corte = ventanaAgenda(hoy);
  comprobar('corte: 6 meses atrás', corte.slice(0, 10) === '2026-04-23', `dio ${corte.slice(0, 10)}`);
  comprobar('corte: es anterior a hoy', Date.parse(corte) < hoy.getTime());
  comprobar('corte: no deja fuera nada futuro', Date.parse(corte) < hoy.getTime());

  // Un mes que retrocede sobre el cambio de año.
  const enero = new Date('2026-01-15T00:00:00Z');
  comprobar('corte en enero cruza el año', ventanaAgenda(enero).slice(0, 10) === '2025-07-15', `dio ${ventanaAgenda(enero).slice(0, 10)}`);
}

if (fallos === 0) console.log('\nTODO OK');
else {
  console.error(`\n${fallos} FALLOS`);
  process.exit(1);
}
