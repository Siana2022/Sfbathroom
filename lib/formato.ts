export function eur(v: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

export function eur2(v: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function numero(v: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v);
}

export function decimal(v: number, digitos = 2): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: digitos, maximumFractionDigits: digitos }).format(v);
}

export function pct(v: number): string {
  const formateado = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  return `${v > 0 ? '+' : ''}${formateado} %`;
}