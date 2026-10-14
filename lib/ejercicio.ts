/**
 * Ejercicio (año) que muestran los cuadros de mando.
 *
 * Se calcula del reloj para no quedar clavado en un año (antes era `2026` fijo en
 * cada página) y admite fijarlo con `NEXT_PUBLIC_EJERCICIO` mientras la ingesta
 * vaya por detrás del calendario.
 */
export const ANIO_ACTUAL = Number(process.env.NEXT_PUBLIC_EJERCICIO) || new Date().getFullYear();
