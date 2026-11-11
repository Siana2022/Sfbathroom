import { cfg } from './config.js';

function cabeceras(): Record<string, string> {
  return {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function envio(url: string, opciones: RequestInit): Promise<{ ok: boolean; status: number; texto: string }> {
  const res = await fetch(url, opciones);
  const t = await res.text();
  return { ok: res.ok, status: res.status, texto: t };
}

export async function cargarVentas(entrada: {
  desde: string;
  hasta: string;
  empresaCodigo: string;
  documentos: Record<string, unknown>[];
  lineas: Record<string, unknown>[];
  meta: Record<string, unknown>;
}): Promise<unknown> {
  const res = await envio(`${cfg.supabaseUrl}/rest/v1/rpc/cargar_ventas`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      p_codigo_empresa: entrada.empresaCodigo,
      p_desde: entrada.desde,
      p_hasta: entrada.hasta,
      p_facturas: entrada.documentos,
      p_lineas: entrada.lineas,
      p_meta: entrada.meta,
    }),
  });
  if (!res.ok) throw new Error(`cargar_ventas: ${res.status} ${res.texto}`);
  return JSON.parse(res.texto || '{}');
}

/**
 * Refresca la vista materializada de rendimiento (mv_perf_facturacion_mensual) tras la
 * ingesta, para que la app sirva los agregados mensuales ya calculados. Ver migración
 * 0038_perf_vistas_materializadas.sql. Idempotente y barato; usa el service_role key.
 */
export async function refrescarVistas(): Promise<void> {
  const res = await envio(`${cfg.supabaseUrl}/rest/v1/rpc/refresh_mv_perf`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`refresh_mv_perf: ${res.status} ${res.texto}`);
}

/**
 * Guarda en cada factura la fecha del pedido de origen y su fecha de entrega
 * comprometida (ver migración 0046). No toca la tabla `pedidos`: la app calcula
 * el plazo pedido→factura con esas dos columnas.
 */
export async function enlazarFechasPedido(
  empresaCodigo: string,
  pares: { factura_numero: string; factura_numero_alt: string; pedido_fecha: string; pedido_entrega: string }[],
): Promise<unknown> {
  const res = await envio(`${cfg.supabaseUrl}/rest/v1/rpc/enlazar_fechas_pedido`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ p_codigo_empresa: empresaCodigo, p_pares: pares }),
  });
  if (!res.ok) throw new Error(`enlazar_fechas_pedido: ${res.status} ${res.texto}`);
  return JSON.parse(res.texto || '{}');
}

export async function leerEstado(clave: string): Promise<Record<string, unknown>> {
  const res = await envio(`${cfg.supabaseUrl}/rest/v1/rpc/leer_estado`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ p_clave: clave }),
  });
  if (!res.ok) throw new Error(`leer_estado: ${res.status} ${res.texto}`);
  return JSON.parse(res.texto || '{}') as Record<string, unknown>;
}