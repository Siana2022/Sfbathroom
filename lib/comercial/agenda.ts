/**
 * Filtrado y agrupación de la agenda del comercial.
 *
 * Módulo puro, sin dependencias de servidor ni de React: se testea aislado.
 * El tablero (`components/TableroAgenda.tsx`) y el panel lo usan para no repetir
 * la misma lógica de conteo y filtrado en dos sitios.
 */

import { MODALIDADES_REUNION, type ModalidadReunion, type ReunionConContexto } from './tipos';

/** Filtro de modalidad del tablero. `todas` no filtra. */
export type FiltroModalidad = ModalidadReunion | 'todas';

export type ColumnasAgenda = {
  programada: ReunionConContexto[];
  realizada: ReunionConContexto[];
  cancelada: ReunionConContexto[];
};

export const COLUMNAS_AGENDA: { estado: keyof ColumnasAgenda; etiqueta: string }[] = [
  { estado: 'programada', etiqueta: 'Programadas' },
  { estado: 'realizada', etiqueta: 'Realizadas' },
  { estado: 'cancelada', etiqueta: 'Canceladas' },
];

/**
 * Reparte las reuniones en las tres columnas del tablero.
 *
 * El orden difiere a propósito según la columna: las programadas van de más
 * próxima a más lejana (es la que se consulta para saber qué viene), y las ya
 * cerradas de más reciente a más antigua (es la que se consulta para recordar).
 */
export function agruparPorEstado(reuniones: ReunionConContexto[]): ColumnasAgenda {
  const salida: ColumnasAgenda = { programada: [], realizada: [], cancelada: [] };
  for (const r of reuniones) {
    const col = salida[r.estado as keyof ColumnasAgenda];
    if (col) col.push(r);
  }
  const porFechaAsc = (a: ReunionConContexto, b: ReunionConContexto) =>
    Date.parse(a.fecha_hora) - Date.parse(b.fecha_hora);
  salida.programada.sort(porFechaAsc);
  salida.realizada.sort((a, b) => porFechaAsc(b, a));
  salida.cancelada.sort((a, b) => porFechaAsc(b, a));
  return salida;
}

/**
 * Aplica el filtro de modalidad. Una reunión sin modalidad solo aparece con el
 * filtro en `todas`: no se puede afirmar que sea de una modalidad concreta.
 */
export function filtrarPorModalidad(
  reuniones: ReunionConContexto[],
  filtro: FiltroModalidad,
): ReunionConContexto[] {
  if (filtro === 'todas') return reuniones;
  return reuniones.filter((r) => r.modalidad === filtro);
}

/**
 * Cuántas reuniones hay de cada modalidad, contando sobre el total.
 *
 * Es deliberado que el conteo ignore el filtro activo: el comercial necesita ver
 * la magnitud de lo que el filtro oculta, sin tener que quitarlo para averiguarlo.
 */
export function contarPorModalidad(reuniones: ReunionConContexto[]): Record<FiltroModalidad, number> {
  const cuenta = { todas: reuniones.length } as Record<FiltroModalidad, number>;
  for (const m of MODALIDADES_REUNION) cuenta[m.valor] = 0;
  for (const r of reuniones) {
    if (r.modalidad && r.modalidad in cuenta) cuenta[r.modalidad] += 1;
  }
  return cuenta;
}

/** Cuántas reuniones quedan visibles en cada columna con el filtro puesto. */
export function contarPorColumna(
  columnas: ColumnasAgenda,
  filtro: FiltroModalidad,
): Record<keyof ColumnasAgenda, number> {
  return {
    programada: filtrarPorModalidad(columnas.programada, filtro).length,
    realizada: filtrarPorModalidad(columnas.realizada, filtro).length,
    cancelada: filtrarPorModalidad(columnas.cancelada, filtro).length,
  };
}

/**
 * Normaliza el valor de `?modalidad=` que llega por la URL.
 *
 * La URL la escribe el usuario, así que puede traer cualquier cosa: lo que no
 * sea una modalidad conocida se trata como «todas» en lugar de dejar el tablero
 * vacío sin explicación.
 */
export function normalizarFiltroModalidad(valor: string | string[] | undefined): FiltroModalidad {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (!v) return 'todas';
  const validas: FiltroModalidad[] = ['todas', ...MODALIDADES_REUNION.map((m) => m.valor)];
  return validas.includes(v as FiltroModalidad) ? (v as FiltroModalidad) : 'todas';
}

/** Meses de reuniones ya cerradas que el tablero mantiene a la vista. */
export const MESES_HISTORICO_AGENDA = 6;

/**
 * Valor por defecto del campo «fecha y hora» al agendar: mañana a las 9:00.
 *
 * Se devuelve en hora local, no UTC: el campo `datetime-local` se interpreta en
 * la zona del navegador, así que fijar las 9:00 en UTC daría otra hora en
 * pantalla y el comercial agendaría sin querer a las 7:00 o a las 11:00.
 */
export function porDefectoReunion(ahora: Date = new Date()): string {
  const m = new Date(ahora.getTime() + 86400000);
  m.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${m.getFullYear()}-${p(m.getMonth() + 1)}-${p(m.getDate())}T${p(m.getHours())}:${p(m.getMinutes())}`;
}

/**
 * Corte inferior de la ventana de agenda que se carga.
 *
 * El tablero enseña todo el futuro (nada que agendar se queda fuera) más unos
 * meses de reuniones cerradas. Sin este límite, la consulta acabaría trayendo
 * años de histórico que nadie consulta.
 */
export function ventanaAgenda(hoy: Date = new Date()): string {
  const d = new Date(hoy.getTime());
  d.setUTCMonth(d.getUTCMonth() - MESES_HISTORICO_AGENDA);
  return d.toISOString();
}
