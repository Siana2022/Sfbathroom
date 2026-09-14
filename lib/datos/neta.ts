/**
 * Importe neto de un documento, robusto al signo del dato fuente.
 * Devuelve positivo para factura / nota_cargo, negativo para abono.
 * Si el dato ya viene con el signo correcto (abono negativo), se mantiene.
 */
export function netaDeDocumento(tipo_documento: string | null | undefined, total: number | null | undefined): number {
  const t = Number(total ?? 0);
  if (tipo_documento === 'abono') return -Math.abs(t);
  return Math.abs(t);
}

/** Signo multiplicador para documentos: -1 para abono, +1 para el resto. */
export function signoDocumento(tipo_documento: string | null | undefined): number {
  return tipo_documento === 'abono' ? -1 : 1;
}
