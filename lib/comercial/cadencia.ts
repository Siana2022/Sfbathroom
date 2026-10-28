/**
 * Cadencia de pedido por cliente.
 *
 * Un umbral fijo de "60 días sin pedir" trata igual a un cliente que compra
 * cada mes y a uno que compra una vez al año: al primero no se le llama hasta
 * que ya se ha ido, y al segundo se le molesta sin motivo.
 *
 * Aquí se estima cada cuánto pide cada cliente y la alerta salta cuando lleva
 * más tiempo del habitual *para él*. Se usa la MEDIANA de los intervalos, no la
 * media: un parón puntual (una obra larga, un problema de stock) desplaza la
 * media y enmascara la alerta, mientras que la mediana aguanta ese valor atípico.
 *
 * Módulo puro, sin dependencias de servidor: se testea sin base de datos.
 */

const DIA = 86400000;

export type Cadencia = {
  /** Días típicos entre pedidos (mediana de intervalos). null si no se puede estimar. */
  dias: number | null;
  /** Nº de pedidos usados en el cálculo. */
  pedidos: number;
  /** Días desde el último pedido. null si nunca ha pedido. */
  diasSinPedir: number | null;
  /** true si lleva más de `dias * FACTOR` sin pedir. */
  vencido: boolean;
  /** Cuántas veces su cadencia lleva sin pedir (1.0 = justo en su cadencia). null si no hay cadencia. */
  ratio: number | null;
};

/**
 * Margen sobre la cadencia antes de considerar al cliente vencido. 1,5 deja un
 * 50% de holgura: avisa cuando el retraso ya no se explica por el ruido normal
 * de la compra, pero antes de que la relación esté fría.
 */
export const FACTOR_VENCIDO = 1.5;

/** Sin al menos 2 pedidos no hay intervalo que medir. */
export const PEDIDOS_MINIMOS = 2;

/** Cadencia de reserva cuando no hay histórico suficiente, en días. */
export const CADENCIA_POR_DEFECTO = 60;

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
}

/**
 * Calcula la cadencia a partir de las fechas de pedido (cualquier orden).
 * `hoy` se inyecta para poder testear sin depender del reloj.
 */
export function calcularCadencia(fechasPedido: string[], hoy: Date = new Date()): Cadencia {
  const fechas = [...new Set(fechasPedido)].map((f) => Date.parse(f)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);

  if (fechas.length === 0) {
    return { dias: null, pedidos: 0, diasSinPedir: null, vencido: false, ratio: null };
  }

  const diasSinPedir = Math.floor((hoy.getTime() - fechas[fechas.length - 1]) / DIA);

  if (fechas.length < PEDIDOS_MINIMOS) {
    return { dias: null, pedidos: fechas.length, diasSinPedir, vencido: false, ratio: null };
  }

  const intervalos: number[] = [];
  for (let i = 1; i < fechas.length; i += 1) {
    const dias = Math.round((fechas[i] - fechas[i - 1]) / DIA);
    // Pedidos el mismo día (o duplicados de la fuente) no aportan intervalo.
    if (dias > 0) intervalos.push(dias);
  }

  const dias = mediana(intervalos);
  if (dias === null) {
    return { dias: null, pedidos: fechas.length, diasSinPedir, vencido: false, ratio: null };
  }

  const ratio = diasSinPedir / dias;
  return {
    dias,
    pedidos: fechas.length,
    diasSinPedir,
    vencido: diasSinPedir > dias * FACTOR_VENCIDO,
    ratio,
  };
}

/**
 * Cadencia efectiva para ordenar y para la alerta: la estimada si existe, y si
 * no la de reserva, para que un cliente nuevo sin histórico no quede fuera de
 * la lista de trabajo.
 */
export function cadenciaEfectiva(c: Cadencia): number {
  return c.dias ?? CADENCIA_POR_DEFECTO;
}

/** Texto corto para la interfaz: "cada ~30 d", o "sin histórico" si no se puede estimar. */
export function etiquetaCadencia(c: Cadencia): string {
  if (c.dias === null) return c.pedidos === 1 ? '1 pedido' : 'sin histórico';
  return `cada ~${Math.round(c.dias)} d`;
}
