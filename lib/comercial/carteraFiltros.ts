/**
 * Filtrado y paginación de la cartera. Puro, sin React ni Supabase.
 *
 * El listado de cartera del panel comercial crece con la cartera real (una
 * cartera mediana son cientos de clientes), así que necesita filtrar por
 * territorio y cliente y paginar. Se hace aquí, no en el componente, para
 * poder testear los bordes: página fuera de rango, filtros que no dejan nada,
 * provincia ausente.
 */
import type { EstadoCrm } from './tipos';

export const POR_PAGINA = 50;

export type FiltrosCartera = {
  /** Búsqueda por nombre de cliente (subcadena, insensible a mayúsculas). */
  cliente?: string;
  provincia?: string;
  pais?: string;
  estadoCrm?: EstadoCrm;
};

export type FilaFiltrable = {
  cliente: string;
  provincia: string | null;
  pais: string | null;
  estadoCrm: EstadoCrm | null;
};

/** Normaliza un valor de filtro: vacío o solo espacios es "sin filtro". */
export function limpiarFiltro(v: string | string[] | undefined): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

export function normalizarFiltros(sp: {
  cliente?: string | string[];
  provincia?: string | string[];
  pais?: string | string[];
  estado?: string | string[];
}): FiltrosCartera {
  const estado = limpiarFiltro(sp.estado);
  const validos: EstadoCrm[] = ['habitual', 'nuevo', 'seguimiento', 'ganado', 'perdido'];
  return {
    cliente: limpiarFiltro(sp.cliente),
    provincia: limpiarFiltro(sp.provincia),
    pais: limpiarFiltro(sp.pais),
    estadoCrm: estado && validos.includes(estado as EstadoCrm) ? (estado as EstadoCrm) : undefined,
  };
}

/** ¿Hay algún filtro activo? Sirve para redactar "no hay resultados" con sentido. */
export function hayFiltros(f: FiltrosCartera): boolean {
  return Boolean(f.cliente || f.provincia || f.pais || f.estadoCrm);
}

/**
 * Aplica los filtros. Un cliente sin provincia o sin país no cae en un filtro
 * territorial: no se puede afirmar que esté en una provincia que no consta.
 */
export function filtrarCartera<T extends FilaFiltrable>(filas: T[], f: FiltrosCartera): T[] {
  const busca = f.cliente?.toLocaleLowerCase('es');
  return filas.filter((x) => {
    if (busca && !x.cliente.toLocaleLowerCase('es').includes(busca)) return false;
    if (f.provincia && x.provincia !== f.provincia) return false;
    if (f.pais && x.pais !== f.pais) return false;
    if (f.estadoCrm && x.estadoCrm !== f.estadoCrm) return false;
    return true;
  });
}

export type Pagina<T> = {
  filas: T[];
  pagina: number;
  totalPaginas: number;
  total: number;
  desde: number;
  hasta: number;
};

/**
 * Pagina. Si llega una página fuera de rango (un enlace viejo, o el filtro
 * cambió y ahora hay menos páginas) se devuelve la última válida en lugar de
 * una lista vacía, que parecería que no hay clientes.
 */
export function paginar<T>(filas: T[], pagina: number, porPagina = POR_PAGINA): Pagina<T> {
  const total = filas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const p = Math.min(Math.max(1, Math.trunc(pagina) || 1), totalPaginas);
  const inicio = (p - 1) * porPagina;
  return {
    filas: filas.slice(inicio, inicio + porPagina),
    pagina: p,
    totalPaginas,
    total,
    desde: total === 0 ? 0 : inicio + 1,
    hasta: Math.min(inicio + porPagina, total),
  };
}

/** Lee el número de página de la URL. */
export function normalizarPagina(v: string | string[] | undefined): number {
  const s = limpiarFiltro(v);
  if (!s) return 1;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}

/** Opciones presentes en los datos, con su recuento, para los desplegables. */
export function opcionesDe<T extends FilaFiltrable>(
  filas: T[],
  campo: 'provincia' | 'pais',
): { valor: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const v = f[campo];
    if (!v) continue;
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, 'es'));
}
