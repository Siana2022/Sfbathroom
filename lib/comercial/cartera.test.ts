/**
 * Tests del orden de trabajo de la cartera. Módulo puro: no necesita Supabase.
 * Ejecutar: compilar con tsc y correr con node.
 */
import { ordenarPorUrgencia, type FilaPanel } from './cartera';

let fallos = 0;
function comprobar(nombre: string, cond: boolean, detalle = '') {
  if (cond) console.log(`  ok  ${nombre}`);
  else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

const f = (nombre: string, vencido: boolean, ratio: number | null): FilaPanel => ({
  cliente_id: nombre,
  cliente: nombre,
  provincia: null,
  pais: null,
  cadenciaDias: null,
  cadenciaTexto: '',
  diasSinPedir: null,
  ratio,
  vencido,
  pedidosPeriodo: 0,
  importePeriodo: 0,
  contactos: 0,
  ultimaInteraccion: null,
  estadoComercial: null,
  estadoCrm: null,
  motivoPerdida: null,
});

console.log('orden por urgencia');

{
  const filas = [f('Tranquilo', false, 0.5), f('Urgente', true, 3.2), f('Medio', true, 1.8)];
  const o = ordenarPorUrgencia(filas).map((x) => x.cliente);
  comprobar('vencidos primero, por ratio desc', o[0] === 'Urgente' && o[1] === 'Medio' && o[2] === 'Tranquilo', o.join(','));
}

{
  const filas = [f('SinRatio', true, null), f('ConRatio', true, 2)];
  const o = ordenarPorUrgencia(filas).map((x) => x.cliente);
  comprobar('sin ratio va después de con ratio', o[0] === 'ConRatio', o.join(','));
}

{
  const filas = [f('B', false, 1), f('A', false, 1)];
  const o = ordenarPorUrgencia(filas).map((x) => x.cliente);
  comprobar('empate: orden alfabético', o[0] === 'A' && o[1] === 'B', o.join(','));
}

{
  const filas = [f('Uno', true, 2), f('Dos', false, null)];
  const antes = filas.map((x) => x.cliente).join(',');
  ordenarPorUrgencia(filas);
  comprobar('no muta la entrada', filas.map((x) => x.cliente).join(',') === antes);
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
if (fallos > 0) throw new Error(`${fallos} fallos`);
