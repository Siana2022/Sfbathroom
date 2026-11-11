import type { createClient } from '@/lib/supabase/server';

/**
 * Helper de rendimiento compartido por los módulos de venta (margen, concentración,
 * clientes, actividad, etc.). Trae facturas + líneas de una empresa y año en UNA sola
 * llamada vía el RPC `ventas_anio` (ver 0040_perf_ventas_anio_rpc.sql), en lugar de las
 * decenas de round-trips de `todasLasFilas(facturas)` + `lineasPorFacturas`.
 *
 * El RPC respeta la cartera del rol (auth_role()/auth_comercial_id()), así que la selección
 * es equivalente a la RLS del camino anterior. La agregación sigue haciéndose en Node en cada
 * módulo (mismos números exactos); esto solo cambia la FUENTE de los datos.
 *
 * Devuelve null si el RPC no está desplegado aún o falla, para que el llamador caiga al
 * camino antiguo (compatibilidad con producción antes de aplicar 0040).
 */

export type FacturaVenta = {
  id: string;
  cliente_id: string | null;
  comercial_id: string | null;
  fecha: string;
  tipo_documento: string;
  base_imponible: number;
  total: number;
};

export type LineaVenta = {
  factura_id: string;
  articulo_id: string | null;
  cantidad: number;
  precio_unitario: number | null;
  base_imponible: number | null;
  importe: number | null;
  coste_unitario: number | null;
};

export type VentasAnio = { facturas: FacturaVenta[]; lineas: LineaVenta[] };

export async function ventasAnioRpc(
  supabase: ReturnType<typeof createClient>,
  codigoEmpresa: string,
  anio: number,
): Promise<VentasAnio | null> {
  const { data, error } = await supabase.rpc('ventas_anio', {
    p_codigo_empresa: codigoEmpresa,
    p_anio: anio,
  });
  if (error || !data) return null;
  const d = data as { facturas?: FacturaVenta[]; lineas?: LineaVenta[] };
  if (!Array.isArray(d.facturas) || !Array.isArray(d.lineas)) return null;
  return { facturas: d.facturas, lineas: d.lineas };
}

/** Cabecera de factura con numero_erp (para módulos con ventana de fechas arbitraria). */
export type FacturaVentaCab = FacturaVenta & { numero_erp: string | null };

/**
 * Cabeceras de factura de una empresa en [desde, hasta] en una sola llamada (RPC
 * ventas_facturas_rango, ver 0041). Para módulos con ventana de fechas que no es un año natural
 * (clientes, actividad). Devuelve null si el RPC no está desplegado o falla.
 */
export async function ventasFacturasRangoRpc(
  supabase: ReturnType<typeof createClient>,
  codigoEmpresa: string,
  desde: string,
  hasta: string,
): Promise<FacturaVentaCab[] | null> {
  const { data, error } = await supabase.rpc('ventas_facturas_rango', {
    p_codigo_empresa: codigoEmpresa,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error || !data || !Array.isArray(data)) return null;
  return data as FacturaVentaCab[];
}
