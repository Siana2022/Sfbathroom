/**
 * Filtrado, orden y paginación de la cartera. Puro, sin React ni Supabase.
 *
 * El listado de cartera del panel comercial crece con la cartera real (una
 * cartera mediana son cientos de clientes), así que necesita filtrar por
 * territorio y cliente, ordenar por cualquier columna y paginar. Se hace aquí,
 * no en el componente, para poder testear los bordes: página fuera de rango,
 * filtros que no dejan nada, provincia ausente, columnas con huecos.
 */
import { ESTADOS_CRM, type EstadoCrm } from './tipos';

export const POR_PAGINA = 50;

export type FiltrosCartera = {
  /** Búsqueda por nombre de cliente (subcadena, insensible a mayúsculas). */
  cliente?: string;
  provincia?: string;
  pais?: string;
  estadoCrm?: EstadoCrm;
  /**
   * Solo los clientes que requieren llamada: llevan más tiempo sin pedir del
   * habitual para ellos (el mismo criterio que el contador "requieren llamada").
   */
  aLlamar?: boolean;
};

export type FilaFiltrable = {
  cliente: string;
  provincia: string | null;
  pais: string | null;
  estadoCrm: EstadoCrm | null;
  /** Requiere llamada (mismo criterio que el contador del KPI). */
  vencido?: boolean;
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
  llamar?: string | string[];
}): FiltrosCartera {
  const estado = limpiarFiltro(sp.estado);
  const validos: EstadoCrm[] = ['habitual', 'nuevo', 'seguimiento', 'ganado', 'perdido'];
  return {
    cliente: limpiarFiltro(sp.cliente),
    provincia: limpiarFiltro(sp.provincia),
    pais: limpiarFiltro(sp.pais),
    estadoCrm: estado && validos.includes(estado as EstadoCrm) ? (estado as EstadoCrm) : undefined,
    // Solo el valor "1" activa el filtro: cualquier otra cosa en la URL lo ignora.
    aLlamar: limpiarFiltro(sp.llamar) === '1',
  };
}

/** ¿Hay algún filtro activo? Sirve para redactar "no hay resultados" con sentido. */
export function hayFiltros(f: FiltrosCartera): boolean {
  return Boolean(f.cliente || f.provincia || f.pais || f.estadoCrm || f.aLlamar);
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
    if (f.aLlamar && !x.vencido) return false;
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

// ---------------- Orden por columnas ----------------

/** Columnas por las que se puede ordenar la cartera. */
export type ColumnaOrden =
  | 'cliente'
  | 'provincia'
  | 'cadencia'
  | 'diasSinPedir'
  | 'pedidosPeriodo'
  | 'importePeriodo'
  | 'contactoHabitual'
  | 'estado';

export const COLUMNAS_ORDEN: ColumnaOrden[] = [
  'cliente',
  'provincia',
  'cadencia',
  'diasSinPedir',
  'pedidosPeriodo',
  'importePeriodo',
  'contactoHabitual',
  'estado',
];

export type Direccion = 'asc' | 'desc';

export type Orden = { columna: ColumnaOrden; direccion: Direccion };

/** Campos que hacen falta para ordenar. Los mismos que pinta la tabla. */
export type FilaOrdenable = FilaFiltrable & {
  cadenciaDias: number | null;
  diasSinPedir: number | null;
  pedidosPeriodo: number;
  importePeriodo: number;
  contactoHabitual: string | null;
  estadoCrm: EstadoCrm | null;
};

/** Posición canónica de cada estado, para que el orden sea el del desplegable. */
const ORDEN_ESTADO: Record<string, number> = Object.fromEntries(
  ESTADOS_CRM.map((e, i) => [e.valor, i]),
);

/**
 * Lee el orden de la URL. Una columna desconocida cae al orden por defecto en
 * lugar de romper: los enlaces viejos siguen funcionando.
 */
export function normalizarOrden(
  columna: string | string[] | undefined,
  direccion: string | string[] | undefined,
): Orden | null {
  const c = limpiarFiltro(columna);
  if (!c || !COLUMNAS_ORDEN.includes(c as ColumnaOrden)) return null;
  const d = limpiarFiltro(direccion);
  // Si no se dice dirección, un texto empieza de A a Z y un número de mayor a
  // menor: es lo que uno espera al pinchar una columna por primera vez.
  const porDefecto: Direccion = c === 'cliente' || c === 'provincia' || c === 'estado' ? 'asc' : 'desc';
  return { columna: c as ColumnaOrden, direccion: d === 'asc' || d === 'desc' ? d : porDefecto };
}

/**
 * Dirección que toca al pinchar una cabecera: si ya se ordena por esa columna,
 * se invierte; si no, se estrena con la dirección natural de esa columna.
 */
export function alternarOrden(actual: Orden | null, columna: ColumnaOrden): Orden {
  if (actual?.columna === columna) {
    return { columna, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' };
  }
  const natural: Direccion = columna === 'cliente' || columna === 'provincia' || columna === 'estado' ? 'asc' : 'desc';
  return { columna, direccion: natural };
}

/** Compara dos valores que pueden faltar. Los huecos van siempre al final. */
function comparar(a: number | null, b: number | null, dir: Direccion): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function texto(a: string | null, b: string | null, dir: Direccion): number {
  // Un cliente sin provincia no es "menor que" los demás: se va al final para
  // no encabezar la lista con huecos.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = a.localeCompare(b, 'es', { sensitivity: 'base' });
  return dir === 'asc' ? r : -r;
}

/**
 * Ordena por la columna pedida. Es un `sort` estable: a igualdad de valor se
 * mantiene el orden de entrada (el de urgencia), así que dos filas empatadas no
 * bailan entre recargas. Los nulos van al final en ambas direcciones.
 */
export function ordenarCartera<T extends FilaOrdenable>(filas: T[], orden: Orden): T[] {
  const { columna, direccion } = orden;
  return [...filas].sort((a, b) => {
    switch (columna) {
      case 'cliente':
        return texto(a.cliente, b.cliente, direccion);
      case 'provincia':
        return texto(a.provincia, b.provincia, direccion);
      case 'cadencia':
        return comparar(a.cadenciaDias, b.cadenciaDias, direccion);
      case 'diasSinPedir':
        return comparar(a.diasSinPedir, b.diasSinPedir, direccion);
      case 'pedidosPeriodo':
        return comparar(a.pedidosPeriodo, b.pedidosPeriodo, direccion);
      case 'importePeriodo':
        return comparar(a.importePeriodo, b.importePeriodo, direccion);
      case 'contactoHabitual':
        return texto(a.contactoHabitual, b.contactoHabitual, direccion);
      case 'estado': {
        const ia = a.estadoCrm === null ? null : ORDEN_ESTADO[a.estadoCrm] ?? 99;
        const ib = b.estadoCrm === null ? null : ORDEN_ESTADO[b.estadoCrm] ?? 99;
        return comparar(ia, ib, direccion);
      }
    }
  });
}
