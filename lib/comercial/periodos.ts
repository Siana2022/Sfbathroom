/**
 * Periodos y ordenación del panel comercial.
 *
 * Módulo puro, sin dependencias de servidor, igual que `tipos.ts` y
 * `cadencia.ts`: así se puede testear sin levantar Supabase ni Next.
 *
 * Vive aparte de `lib/datos/panelComercial.ts` porque ese importa
 * `next/headers` (cliente Supabase con cookies) y no se puede cargar en un
 * test aislado.
 */

const DIA = 86400000;

export type RangoFechas = { desde: string; hasta: string };

/** Nº de días de un rango, ambos extremos incluidos. */
export function diasDeRango(r: RangoFechas): number {
  return Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / DIA) + 1;
}

/** Fecha de hoy en ISO corto, en UTC. */
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Rango por defecto del panel: últimos 90 días hasta hoy. */
export function rangoPorDefecto(): RangoFechas {
  const hasta = hoyISO();
  const desde = new Date(Date.now() - 90 * DIA).toISOString().slice(0, 10);
  return { desde, hasta };
}

/** Valida `YYYY-MM-DD` y cae al rango por defecto si el valor no sirve. */
export function normalizarRango(desde?: string, hasta?: string): RangoFechas {
  const def = rangoPorDefecto();
  const d = desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : def.desde;
  const h = hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? hasta : def.hasta;
  return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
}

/**
 * Rango inmediatamente anterior, de la MISMA duración.
 *
 * La misma duración es lo que hace justa la comparación de facturación: si el
 * periodo elegido es junio (30 días), el anterior son 30 días hasta el 31 de
 * mayo, no el mes de mayo entero (31 días).
 */
export function rangoAnterior(r: RangoFechas): RangoFechas {
  const n = diasDeRango(r);
  const hasta = new Date(Date.parse(r.desde) - DIA).toISOString().slice(0, 10);
  const desde = new Date(Date.parse(r.desde) - n * DIA).toISOString().slice(0, 10);
  return { desde, hasta };
}
