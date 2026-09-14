import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getFacturaIdsFiltradas, filtrarPorIds } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';
import { netaDeDocumento } from '@/lib/datos/neta';
import { METRICAS, type KpiConfig, type MetricaClave } from '@/lib/datos/kpisCatalogo';

type FilaFactura = {
  id: string; fecha: string; tipo_documento: string; total: number;
  cliente_id: string | null; comercial_id: string | null;
};
type FilaLinea = { factura_id: string; articulo_id: string | null; cantidad: number; importe: number };
type FilaArticulo = { id: string; coste_unitario: number | null };

export type ResultadoKpi = { valor: number | null; formato: string };

function parseFiltros(cfg: KpiConfig) {
  const f = cfg.filtros ?? {};
  const anio = f.ejercicio ? Number(f.ejercicio) : new Date().getFullYear();
  const desde = f.fecha_desde ?? `${anio}-01-01`;
  const hasta = f.fecha_hasta ?? `${anio}-12-31`;
  const familia = f.familia_id;
  const comercial = f.comercial_id;
  const cliente = f.cliente_id;
  const marca = (f as Record<string, string>).marca_id;
  return { anio, desde, hasta, familia, comercial, cliente, marca };
}

async function empresaId(supabase: ReturnType<typeof createClient>, codigo: string) {
  const e = await getEmpresaPorCodigo(codigo);
  return e.id;
}

/** Resuelve canal_id / pais a un Set de cliente_ids si es necesario. */
async function resolverClientesExtra(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  filtros: KpiConfig['filtros'],
): Promise<Set<string> | null> {
  const canal = filtros?.canal_id;
  const pais = filtros?.pais;
  if (!canal && !pais) return null;
  let q = supabase.from('clientes').select('id').eq('empresa_id', empId);
  if (canal) q = q.eq('canal_id', canal);
  if (pais) q = q.eq('pais_facturacion', pais);
  const { data } = await q;
  return new Set((data ?? []).map((c: { id: string }) => c.id));
}

/** Resuelve todos los filtros en IDs de factura filtrados + date range. */
async function resolverFacturasFiltradas(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  cfg: KpiConfig,
) {
  const f = cfg.filtros ?? {};
  const anio = f.ejercicio ? Number(f.ejercicio) : new Date().getFullYear();
  const desde = f.fecha_desde ?? `${anio}-01-01`;
  const hasta = f.fecha_hasta ?? `${anio}-12-31`;

  const clientesExtra = await resolverClientesExtra(supabase, empId, f);
  const filtrosFiltros = {
    cliente: f.cliente_id,
    comercial: f.comercial_id,
    familia: f.familia_id,
    marca: f.marca_id,
  };

  const ids = await getFacturaIdsFiltradas(supabase, empId, filtrosFiltros, desde, hasta);

  return { ids, desde, hasta, clientesExtra };
}

// ─── Handlers ──────────────────────────────────────────────────────────

async function handleVentasNetas(supabase: ReturnType<typeof createClient>, empId: string, desde: string, hasta: string, ids: Set<string> | null, clientesExtra: Set<string> | null): Promise<number> {
  let q = supabase.from('facturas').select('id, fecha, tipo_documento, total, cliente_id').eq('empresa_id', empId).gte('fecha', desde).lte('fecha', hasta);
  if (clientesExtra) {
    const { data } = await q;
    const filas = (data ?? []) as FilaFactura[];
    const filtradas = clientesExtra ? filas.filter((f) => f.cliente_id && clientesExtra.has(f.cliente_id)) : filas;
    return filtradas.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  }
  const { data } = await q;
  const filas = filtrarPorIds((data ?? []) as FilaFactura[], ids);
  return filas.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
}

async function handleUnidades(supabase: ReturnType<typeof createClient>, empId: string, desde: string, hasta: string, ids: Set<string> | null, clientesExtra: Set<string> | null): Promise<number> {
  const idsFacturas = ids ?? await resolverIdsConClientes(supabase, empId, desde, hasta, clientesExtra);
  const lineas = await lineasPorFacturas<{ cantidad: number }>(supabase, 'cantidad', [...idsFacturas]);
  return lineas.reduce((s, l) => s + Number(l.cantidad ?? 0), 0);
}

async function handleNumClientes(supabase: ReturnType<typeof createClient>, empId: string, desde: string, hasta: string, ids: Set<string> | null, clientesExtra: Set<string> | null): Promise<number> {
  let q = supabase.from('facturas').select('cliente_id').eq('empresa_id', empId).gte('fecha', desde).lte('fecha', hasta).not('cliente_id', 'is', null);
  const { data } = await q;
  let filas = filtrarPorIds((data ?? []) as { id: string; cliente_id: string }[], ids);
  if (clientesExtra) filas = filas.filter((f) => clientesExtra.has(f.cliente_id));
  return new Set(filas.map((f) => f.cliente_id)).size;
}

async function handleTicketMedio(supabase: ReturnType<typeof createClient>, empId: string, desde: string, hasta: string, ids: Set<string> | null, clientesExtra: Set<string> | null): Promise<number> {
  const { data } = await supabase
    .from('facturas')
    .select('id, tipo_documento, total, cliente_id')
    .eq('empresa_id', empId)
    .gte('fecha', desde)
    .lte('fecha', hasta);
  let filas = filtrarPorIds((data ?? []) as FilaFactura[], ids);
  if (clientesExtra) filas = filas.filter((f) => f.cliente_id && clientesExtra.has(f.cliente_id));
  const neta = filas.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const nFacturas = filas.filter((f) => f.tipo_documento !== 'abono').length;
  return nFacturas > 0 ? neta / nFacturas : 0;
}

async function handleDso(supabase: ReturnType<typeof createClient>, empId: string): Promise<number> {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const { data: aging } = await supabase.from('v_aging').select('pendiente, dias_mora').eq('empresa_id', empId);
  const saldo = (aging ?? []).reduce((s: number, r: { pendiente: number }) => s + Number(r.pendiente ?? 0), 0);
  const haceAnio = new Date(hoy); haceAnio.setFullYear(haceAnio.getFullYear() - 1);
  const desde = haceAnio.toISOString().slice(0, 10);
  const hasta = hoy.toISOString().slice(0, 10);
  const { data: factUltAnio } = await supabase.from('facturas').select('tipo_documento, total').eq('empresa_id', empId).gte('fecha', desde).lte('fecha', hasta);
  const neta12m = (factUltAnio ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  return neta12m > 0 ? saldo / (neta12m / 365) : 0;
}

async function handlePctDevoluciones(supabase: ReturnType<typeof createClient>, empId: string, desde: string, hasta: string, ids: Set<string> | null, clientesExtra: Set<string> | null): Promise<number> {
  let q = supabase.from('facturas').select('tipo_documento, total, cliente_id').eq('empresa_id', empId).gte('fecha', desde).lte('fecha', hasta);
  const { data } = await q;
  let filas = filtrarPorIds((data ?? []) as FilaFactura[], ids);
  if (clientesExtra) filas = filas.filter((f) => f.cliente_id && clientesExtra.has(f.cliente_id));
  const total = filas.reduce((s, f) => s + Math.abs(Number(f.total ?? 0)), 0);
  const abonos = filas.filter((f) => f.tipo_documento === 'abono').reduce((s, f) => s + Math.abs(Number(f.total ?? 0)), 0);
  return total > 0 ? (abonos / total) * 100 : 0;
}

async function handleCumplimiento(supabase: ReturnType<typeof createClient>, empId: string, anio: number, filtros: KpiConfig['filtros']): Promise<number> {
  const neta = await handleVentasNetas(supabase, empId, `${anio}-01-01`, `${anio}-12-31`, null, null);
  let pq = supabase.from('presupuesto').select('importe').eq('empresa_id', empId).eq('ejercicio', anio);
  if (filtros?.cliente_id) pq = pq.eq('cliente_id', filtros.cliente_id);
  if (filtros?.comercial_id) pq = pq.eq('comercial_id', filtros.comercial_id);
  if (filtros?.familia_id) pq = pq.eq('familia_id', filtros.familia_id);
  const { data } = await pq;
  const presupuesto = (data ?? []).reduce((s: number, r: { importe: number }) => s + Number(r.importe ?? 0), 0);
  return presupuesto > 0 ? (neta / presupuesto) * 100 : 0;
}

async function handleMargen(supabase: ReturnType<typeof createClient>, empId: string, desde: string, hasta: string, ids: Set<string> | null, clientesExtra: Set<string> | null, pct: boolean): Promise<number> {
  let q = supabase.from('facturas').select('id, tipo_documento, cliente_id').eq('empresa_id', empId).gte('fecha', desde).lte('fecha', hasta);
  const { data } = await q;
  let filas = filtrarPorIds((data ?? []) as FilaFactura[], ids);
  if (clientesExtra) filas = filas.filter((f) => f.cliente_id && clientesExtra.has(f.cliente_id));
  const facturaIds = filas.map((f) => f.id);
  if (facturaIds.length === 0) return 0;

  const lineas = await lineasPorFacturas<{ factura_id: string; importe: number; cantidad: number; articulo_id: string | null }>(supabase, 'factura_id, importe, cantidad, articulo_id', facturaIds);
  const artIds = [...new Set(lineas.filter((l) => l.articulo_id).map((l) => l.articulo_id!))];
  const articulosMap = new Map<string, number>();
  if (artIds.length) {
    const { data: arts } = await supabase.from('articulos').select('id, coste_unitario').in('id', artIds);
    for (const a of (arts ?? []) as FilaArticulo[]) articulosMap.set(a.id, Number(a.coste_unitario ?? 0));
  }

  const tipoMap = new Map(filas.map((f) => [f.id, f.tipo_documento]));
  let totalVenta = 0;
  let totalCoste = 0;
  for (const l of lineas) {
    const signo = tipoMap.get(l.factura_id) === 'abono' ? -1 : 1;
    totalVenta += Number(l.importe ?? 0) * signo;
    const cu = articulosMap.get(l.articulo_id ?? '') ?? 0;
    totalCoste += cu * Number(l.cantidad ?? 0) * signo;
  }
  const margen = totalVenta - totalCoste;
  return pct ? (totalVenta > 0 ? (margen / totalVenta) * 100 : 0) : margen;
}

async function resolverIdsConClientes(supabase: ReturnType<typeof createClient>, empId: string, desde: string, hasta: string, clientesExtra: Set<string> | null): Promise<Set<string>> {
  const { data } = await supabase.from('facturas').select('id, cliente_id').eq('empresa_id', empId).gte('fecha', desde).lte('fecha', hasta);
  const filas = (data ?? []) as { id: string; cliente_id: string | null }[];
  if (!clientesExtra) return new Set(filas.map((f) => f.id));
  return new Set(filas.filter((f) => f.cliente_id && clientesExtra.has(f.cliente_id)).map((f) => f.id));
}

// ─── Motor principal ───────────────────────────────────────────────────

export async function evaluarKpi(cfg: KpiConfig, codigoEmpresa: string): Promise<ResultadoKpi> {
  const supabase = createClient();
  const empId = await empresaId(supabase, codigoEmpresa);
  const { anio, desde, hasta } = parseFiltros(cfg);

  const metrica = cfg.metrica as MetricaClave;
  const calculo = cfg.calculo;

  // Resolver filtros base
  const { ids, clientesExtra } = await resolverFacturasFiltradas(supabase, empId, cfg);

  // Si es yoy, calcular prev year
  if (calculo === 'yoy') {
    const valor = await resolverMetrica(supabase, empId, metrica, desde, hasta, ids, clientesExtra, cfg);
    const desdePrev = `${anio - 1}${desde.slice(4)}`;
    const hastaPrev = `${anio - 1}${hasta.slice(4)}`;
    const idsPrev = await getFacturaIdsFiltradas(supabase, empId, {
      cliente: cfg.filtros?.cliente_id,
      comercial: cfg.filtros?.comercial_id,
      familia: cfg.filtros?.familia_id,
      marca: cfg.filtros?.marca_id,
    }, desdePrev, hastaPrev);
    const valorPrev = await resolverMetrica(supabase, empId, metrica, desdePrev, hastaPrev, idsPrev, clientesExtra, cfg);
    return { valor: valorPrev !== 0 ? ((valor - valorPrev) / Math.abs(valorPrev)) * 100 : null, formato: cfg.formato ?? 'pct' };
  }

  const valor = await resolverMetrica(supabase, empId, metrica, desde, hasta, ids, clientesExtra, cfg);

  if (calculo === 'pct_total') {
    // Compute without dimension filters (same date range)
    const cfgSinFiltros = { ...cfg, filtros: { ejercicio: cfg.filtros?.ejercicio, fecha_desde: cfg.filtros?.fecha_desde, fecha_hasta: cfg.filtros?.fecha_hasta } };
    const idsTotal = await getFacturaIdsFiltradas(supabase, empId, {}, desde, hasta);
    const valorTotal = await resolverMetrica(supabase, empId, metrica, desde, hasta, idsTotal, null, cfgSinFiltros);
    return { valor: valorTotal > 0 ? (valor / valorTotal) * 100 : null, formato: 'pct' };
  }

  return { valor, formato: cfg.formato ?? METRICAS[metrica]?.formatoDefault ?? 'numero' };
}

async function resolverMetrica(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  metrica: MetricaClave,
  desde: string,
  hasta: string,
  ids: Set<string> | null,
  clientesExtra: Set<string> | null,
  cfg: KpiConfig,
): Promise<number> {
  switch (metrica) {
    case 'ventas_netas':
      return handleVentasNetas(supabase, empId, desde, hasta, ids, clientesExtra);
    case 'unidades':
      return handleUnidades(supabase, empId, desde, hasta, ids, clientesExtra);
    case 'num_clientes':
      return handleNumClientes(supabase, empId, desde, hasta, ids, clientesExtra);
    case 'ticket_medio':
      return handleTicketMedio(supabase, empId, desde, hasta, ids, clientesExtra);
    case 'dso':
      return handleDso(supabase, empId);
    case 'pct_devoluciones':
      return handlePctDevoluciones(supabase, empId, desde, hasta, ids, clientesExtra);
    case 'cumplimiento':
      return handleCumplimiento(supabase, empId, cfg.filtros?.ejercicio ? Number(cfg.filtros.ejercicio) : new Date().getFullYear(), cfg.filtros);
    case 'margen_pct':
      return handleMargen(supabase, empId, desde, hasta, ids, clientesExtra, true);
    case 'margen_abs':
      return handleMargen(supabase, empId, desde, hasta, ids, clientesExtra, false);
    default:
      return 0;
  }
}
