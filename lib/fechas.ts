/**
 * Utilidades de fechas para cálculos de plazos de entrega.
 *
 * Todas las fechas del proyecto son `YYYY-MM-DD` (columnas `date` de Postgres).
 * Se opera en UTC para que un cambio de horario (DST) no desplace el resultado
 * en un día, que es el error clásico al hacer aritmética con `Date` local.
 */

const MS_DIA = 86400000;

function aUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Días naturales entre dos fechas ISO (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA);
}

/** Suma días naturales a una fecha ISO. */
export function sumarDias(iso: string, dias: number): string {
  return new Date(aUtc(iso) + dias * MS_DIA).toISOString().slice(0, 10);
}

/**
 * Suma días hábiles (lunes a viernes) a una fecha ISO.
 * No contempla festivos: el plazo de entrega pactado es comercial, no laboral.
 */
export function sumarDiasHabiles(iso: string, dias: number): string {
  let t = aUtc(iso);
  let quedan = Math.max(0, Math.round(dias));
  while (quedan > 0) {
    t += MS_DIA;
    const diaSemana = new Date(t).getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) quedan -= 1;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** Fecha de hoy en formato ISO, en la zona horaria del servidor. */
export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
