import type { createClient } from '@/lib/supabase/server';
import type { Filtros } from '@/lib/datos/filtros';

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

/**
 * Facturas que cumplen un filtro (cliente/comercial/familia/marca) en [baseDesde, baseHasta] +
 * todas sus líneas, en UNA sola llamada (RPC ventas_filtrado, ver 0042). Para la ruta CON filtros
 * de Facturación, que antes descargaba 1-2 años de facturas/líneas y filtraba en Node (10-15 s).
 * La ventana efectiva usa filtros.desde/hasta si vienen. Respeta la cartera del rol.
 * Devuelve null si el RPC no está desplegado o falla → el llamador usa el camino antiguo.
 */
export async function ventasFiltradoRpc(
  supabase: ReturnType<typeof createClient>,
  codigoEmpresa: string,
  filtros: Filtros,
  baseDesde: string,
  baseHasta: string,
): Promise<VentasAnio | null> {
  const { data, error } = await supabase.rpc('ventas_filtrado', {
    p_codigo_empresa: codigoEmpresa,
    p_desde: filtros.desde ?? baseDesde,
    p_hasta: filtros.hasta ?? baseHasta,
    p_cliente: filtros.cliente ?? null,
    p_comercial: filtros.comercial ?? null,
    p_familia: filtros.familia ?? null,
    p_marca: filtros.marca ?? null,
  });
  if (error || !data) return null;
  const d = data as { facturas?: FacturaVenta[]; lineas?: LineaVenta[] };
  if (!Array.isArray(d.facturas) || !Array.isArray(d.lineas)) return null;
  return { facturas: d.facturas, lineas: d.lineas };
}
