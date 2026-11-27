/**
 * Proyección de cierre del año a partir de lo facturado hasta hoy.
 *
 * Solo tiene sentido para el año en curso: en ejercicios cerrados el resultado ya es
 * el real, y en los primeros días del año la extrapolación dispara.
 */
export function proyeccionAnual(neta: number, anio: number): number | null {
  const hoy = new Date();
  if (anio !== hoy.getFullYear()) return null;

  const inicio = new Date(anio, 0, 1).getTime();
  const fin = new Date(anio + 1, 0, 1).getTime();
  const fraccion = (hoy.getTime() - inicio) / (fin - inicio);
  if (fraccion <= 0.05) return null;

  return neta / fraccion;
}
