import { getActividad, type ComercialRow } from '@/lib/datos/actividad';

export type RankingFila = Omit<ComercialRow, 'secciones'> & {
  /** Posición en el ranking por facturación (1 = mejor). Null en las secciones de un grupo. */
  posicion: number | null;
  /** Peso sobre la facturación total del equipo (%). */
  cuotaPct: number | null;
  /** Variación de facturación frente al año anterior (%). */
  variacionPct: number | null;
  /** Facturación media por factura emitida. */
  ticketMedio: number;
  secciones: RankingFila[];
};

export type RankingData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  sinAccesoMargen: boolean;
  filas: RankingFila[];
  totalNeta: number;
  totalNetaPrev: number;
  variacionEquipoPct: number | null;
  media: number;
  mediana: number;
  totalUnidades: number;
  totalFacturas: number;
};

/** Mediana de una lista ordenada (0 si está vacía). */
function medianaDe(ordenados: number[]): number {
  const n = ordenados.length;
  if (n === 0) return 0;
  const mitad = Math.floor(n / 2);
  return n % 2 === 0 ? (ordenados[mitad - 1] + ordenados[mitad]) / 2 : ordenados[mitad];
}

/**
 * Ranking completo del equipo comercial para dirección.
 *
 * Reutiliza `getActividad` (misma semántica de neta, agrupación STARBATH/BIGMAT,
 * objetivos y margen) y añade lo propio del ranking: posición, cuota, variación
 * frente al año anterior, ticket medio y estadísticos del equipo.
 */
export async function getRankingComerciales(codigoEmpresa: string, anio: number): Promise<RankingData> {
  const d = await getActividad(codigoEmpresa, anio);
  const totalNeta = d.comerciales.reduce((s, c) => s + c.neta, 0);
  const totalNetaPrev = d.comerciales.reduce((s, c) => s + c.netaPrev, 0);

  const cuota = (neta: number): number | null => (totalNeta > 0 ? (neta / totalNeta) * 100 : null);
  const variacion = (neta: number, previa: number): number | null =>
    previa > 0 ? ((neta - previa) / previa) * 100 : null;
  const ticket = (neta: number, facturas: number): number => (facturas > 0 ? neta / facturas : 0);

  const aFila = (c: ComercialRow, posicion: number | null): RankingFila => ({
    ...c,
    posicion,
    cuotaPct: cuota(c.neta),
    variacionPct: variacion(c.neta, c.netaPrev),
    ticketMedio: ticket(c.neta, c.facturas),
    secciones: c.secciones.map((s) => aFila(s, null)),
  });

  // getActividad devuelve los grupos ya ordenados por neta descendente.
  const filas = d.comerciales.map((c, i) => aFila(c, i + 1));
  const netasOrdenadas = filas.map((f) => f.neta).sort((a, b) => a - b);

  return {
    empresa: d.empresa,
    anio: d.anio,
    sinAccesoMargen: d.sinAccesoMargen,
    filas,
    totalNeta,
    totalNetaPrev,
    variacionEquipoPct: variacion(totalNeta, totalNetaPrev),
    media: filas.length > 0 ? totalNeta / filas.length : 0,
    mediana: medianaDe(netasOrdenadas),
    totalUnidades: filas.reduce((s, f) => s + f.unidades, 0),
    totalFacturas: filas.reduce((s, f) => s + f.facturas, 0),
  };
}
