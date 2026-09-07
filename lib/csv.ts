export type Celda = string | number | boolean | null | undefined;

export function aCsv(columnas: string[], registros: Celda[][]): string {
  const escapar = (v: Celda) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n;]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lineas = [columnas.map(escapar).join(';'), ...registros.map((r) => r.map(escapar).join(';'))];
  return '\uFEFF' + lineas.join('\r\n');
}