/**
 * Fila de cartera y orden de trabajo del comercial.
 *
 * Módulo puro, sin dependencias de servidor: se testea aislado. Vive aparte de
 * `lib/datos/panelComercial.ts` porque ese importa `next/headers`.
 */

export type FilaPanel = {
  cliente_id: string;
  cliente: string;
  provincia: string | null;
  pais: string | null;
  /** Días típicos entre pedidos de este cliente (mediana). */
  cadenciaDias: number | null;
  /** Texto ya formateado de la cadencia. */
  cadenciaTexto: string;
  diasSinPedir: number | null;
  /** Días sin pedir / cadencia. 1 = justo en su ritmo. */
  ratio: number | null;
  vencido: boolean;
  pedidosPeriodo: number;
  importePeriodo: number;
  contactos: number;
  ultimaInteraccion: string | null;
  /** 'ganado' si su primer pedido cae en el periodo; 'perdido' si dejó de pedir. */
  estadoComercial: 'ganado' | 'perdido' | null;
};

/**
 * Orden de trabajo: primero los clientes vencidos, y entre ellos los que más se
 * han pasado de su propio ritmo. Es la promesa de la pantalla: arriba está a
 * quién hay que llamar.
 */
export function ordenarPorUrgencia(filas: FilaPanel[]): FilaPanel[] {
  return [...filas].sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
    const ra = a.ratio ?? -1;
    const rb = b.ratio ?? -1;
    if (ra !== rb) return rb - ra;
    return a.cliente.localeCompare(b.cliente);
  });
}
