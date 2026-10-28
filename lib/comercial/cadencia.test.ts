/**
 * Tests de la cadencia de pedido. Ejecutar: npx tsx lib/comercial/cadencia.test.ts
 *
 * Comprueban los casos que importan de verdad: que un cliente mensual salte
 * antes que uno anual, y que un parón puntual no enmascare la alerta.
 */
import { calcularCadencia, etiquetaCadencia, cadenciaEfectiva, FACTOR_VENCIDO } from './cadencia';

let fallos = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

const HOY = new Date('2026-06-15T00:00:00Z');
const dias = (n: number) => {
  const d = new Date(HOY.getTime() - n * 86400000);
  return d.toISOString().slice(0, 10);
};

console.log('cadencia');

// Cliente mensual: pide el día 1 de cada mes durante 6 meses, luego nada.
{
  const fechas = [150, 120, 90, 60, 30].map(dias);
  const c = calcularCadencia(fechas, HOY);
  comprobar('mensual: cadencia ~30 d', c.dias === 30, `dio ${c.dias}`);
  comprobar('mensual: 30 d sin pedir NO está vencido', !c.vencido, `ratio ${c.ratio}`);
}

// El mismo cliente mensual se retrasa 50 días: ya debería saltar la alerta.
{
  const fechas = [170, 140, 110, 80, 50].map(dias);
  const c = calcularCadencia(fechas, HOY);
  comprobar('mensual retrasado: 50 d sin pedir SÍ está vencido', c.vencido, `ratio ${c.ratio}`);
  comprobar('mensual retrasado: ratio > factor', (c.ratio ?? 0) > FACTOR_VENCIDO, `ratio ${c.ratio}`);
}

// Cliente anual: pide cada 365 días. A los 90 días NO está vencido.
{
  const fechas = [1095, 730, 365, 90].map(dias);
  const c = calcularCadencia(fechas, HOY);
  comprobar('anual: cadencia ~365 d', Math.round(c.dias ?? 0) === 365, `dio ${c.dias}`);
  comprobar('anual: 90 d sin pedir NO está vencido', !c.vencido, `ratio ${c.ratio}`);
}

// Un parón puntual no debe enmascarar la alerta (la mediana aguanta el atípico).
{
  const fechas = [400, 370, 340, 310, 280, 130].map(dias);
  const c = calcularCadencia(fechas, HOY);
  comprobar('parón puntual: cadencia sigue siendo ~30 d', Math.round(c.dias ?? 0) === 30, `dio ${c.dias}`);
  comprobar('parón puntual: 130 d sin pedir SÍ está vencido', c.vencido, `ratio ${c.ratio}`);
}

// Un solo pedido: no hay intervalo que medir.
{
  const c = calcularCadencia([dias(10)], HOY);
  comprobar('un pedido: sin cadencia estimada', c.dias === null);
  comprobar('un pedido: no marca vencido', !c.vencido);
  comprobar('un pedido: etiqueta correcta', etiquetaCadencia(c) === '1 pedido', etiquetaCadencia(c));
}

// Sin pedidos.
{
  const c = calcularCadencia([], HOY);
  comprobar('sin pedidos: diasSinPedir null', c.diasSinPedir === null);
  comprobar('sin pedidos: no vencido', !c.vencido);
  comprobar('sin pedidos: usa cadencia por defecto', cadenciaEfectiva(c) === 60, String(cadenciaEfectiva(c)));
}

// Dos pedidos el mismo día no cuentan como intervalo.
{
  const c = calcularCadencia([dias(30), dias(30), dias(60)], HOY);
  comprobar('pedidos el mismo día: cadencia ~30 d', Math.round(c.dias ?? 0) === 30, `dio ${c.dias}`);
}

// Intervalos irregulares: la mediana evita que un hueco grande infle la cadencia.
{
  const fechas = [300, 290, 280, 270, 260, 250, 240, 230, 100].map(dias);
  const c = calcularCadencia(fechas, HOY);
  comprobar('irregular: cadencia ~10 d (mediana)', Math.round(c.dias ?? 0) === 10, `dio ${c.dias}`);
  comprobar('irregular: 100 d sin pedir SÍ está vencido', c.vencido, `ratio ${c.ratio}`);
}

// Fechas desordenadas y con basura.
{
  const c = calcularCadencia([dias(30), 'no-es-fecha', dias(90), dias(60)], HOY);
  comprobar('entrada sucia: ignora basura y ordena', Math.round(c.dias ?? 0) === 30, `dio ${c.dias}`);
}

// La etiqueta de cadencia estimada.
{
  const c = calcularCadencia([dias(60), dias(30)], HOY);
  comprobar('etiqueta: "cada ~30 d"', etiquetaCadencia(c) === 'cada ~30 d', etiquetaCadencia(c));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
