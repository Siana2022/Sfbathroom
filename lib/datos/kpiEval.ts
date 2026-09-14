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
type FilaLinea = { factura_id: string; articulo_id: string | null; importe: number; cantidad: number };
type FilaArticulo = { id: string; coste_unitario: number | null };

export type ResultadoKpi = { valor: number | null; formato: string };

const TAMANO_LOTE = 200;

function trocear<T>(arr: T[], tam = TAMANO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < arr.length; i += tam) lotes.push(arr.slice(i, i + tam));
  return lotes;
}

function parseFiltros(cfg: KpiConfig) {
  const f = cfg.filtros ?? {};
  const anio = f.ejercicio ? Number(f.ejercicio) : new Date().getFullYear();
  const desde = f.fecha_desde ?? `${anio}-01-01`;
  const hasta = f.fecha_hasta ?? `${anio}-12-31`;
  return { anio, desde, hasta };
}

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

/**
 * Ids de artículo que cumplen familia_id / marca_id (si hay filtro de producto).
 */
async function artIdsFiltro(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  filtros: KpiConfig['filtros'],
): Promise<Set<string> | null> {
  const familia = filtros?.familia_id;
  const marca = filtros?.marca_id;
  if (!familia && !marca) return null;
  let q = supabase.from('articulos').select('id').eq('empresa_id', empId);
  if (familia) q = q.eq('familia_id', familia);
  if (marca) q = q.eq('marca_id', marca);
  const { data } = await q;
  return new Set((data ?? []).map((a: { id: string }) => a.id));
}

/**
 * Resuelve TODOS los filtros en un único Set de facturas (intersección):
 * los filtros de factura (cliente/comercial/familia/marca, vía getFacturaIdsFiltradas)
 * se intersectan con los de cliente (canal_id / pais) derivando los clientes.
 * Así los handlers solo usan `ids` y ningún filtro se pierde.
 */
async function resolverIds(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  cfg: KpiConfig,
  desde: string,
  hasta: string,
): Promise<Set<string> | null> {
  const clientesExtra = await resolverClientesExtra(supabase, empId, cfg.filtros);
  const idsBase = await getFacturaIdsFiltradas(supabase, empId, {
    cliente: cfg.filtros?.cliente_id,
    comercial: cfg.filtros?.comercial_id,
    familia: cfg.filtros?.familia_id,
    marca: cfg.filtros?.marca_id,
  }, desde, hasta);

  if (!clientesExtra) return idsBase;
  if (idsBase && idsBase.size === 0) return idsBase;

  if (idsBase) {
    const clientePorId = new Map<string, string>();
    for (const lote of trocear([...idsBase])) {
      const { data } = await supabase.from('facturas').select('id, cliente_id').in('id', lote);
      for (const r of (data ?? []) as { id: string; cliente_id: string | null }[]) {
        if (r.cliente_id) clientePorId.set(r.id, r.cliente_id);
      }
    }
    return new Set([...idsBase].filter((id) => clientesExtra.has(clientePorId.get(id) ?? '')));
  }

  const ids: Set<string> = new Set();
  for (const lote of trocear([...clientesExtra])) {
    const { data } = await supabase
      .from('facturas')
      .select('id')
      .eq('empresa_id', empId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .in('cliente_id', [...lote]);
    for (const r of (data ?? []) as { id: string }[]) ids.add(r.id);
  }
  return ids;
}

async function resolverFacturasFiltradas(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  cfg: KpiConfig,
) {
  const { desde, hasta } = parseFiltros(cfg);
  const ids = await resolverIds(supabase, empId, cfg, desde, hasta);
  return { ids, desde, hasta };
}

// ─── Helpers de cálculo ────────────────────────────────────────────────

async function filasFacturas<T extends { id: string } = FilaFactura>(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  desde: string,
  hasta: string,
  ids: Set<string> | null,
  columnas: string,
): Promise<T[]> {
  const { data } = await supabase
    .from('facturas')
    .select(columnas)
    .eq('empresa_id', empId)
    .gte('fecha', desde)
    .lte('fecha', hasta);
  return filtrarPorIds((data ?? []) as unknown as T[], ids);
}

/**
 * Suma a nivel de línea (factura_lineas) cuando hay filtro de producto.
 * Solo las líneas cuyo artículo cumple familia/marca entran en la suma → sin sobreconteo
 * de la factura completa.
 */
async function netaPorLineas(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  desde: string,
  hasta: string,
  ids: Set<string> | null,
  artIds: Set<string>,
): Promise<{ neta: number; nFacturas: number; ventaAbs: number; abonosAbs: number }> {
  const filas = await filasFacturas(supabase, empId, desde, hasta, ids, 'id, tipo_documento, total, cliente_id');
  if (filas.length === 0) return { neta: 0, nFacturas: 0, ventaAbs: 0, abonosAbs: 0 };

  const lineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, importe, cantidad', filas.map((f) => f.id));
  const tipoMap = new Map(filas.map((f) => [f.id, f.tipo_documento]));

  let neta = 0;
  let ventaAbs = 0;
  let abonosAbs = 0;
  const facturasConLinea = new Set<string>();
  for (const l of lineas) {
    if (!artIds.has(l.articulo_id ?? '')) continue;
    const esAbono = tipoMap.get(l.factura_id) === 'abono';
    const importe = Number(l.importe ?? 0);
    neta += esAbono ? -Math.abs(importe) : importe;
    if (esAbono) abonosAbs += Math.abs(importe);
    else { ventaAbs += Math.abs(importe); facturasConLinea.add(l.factura_id); }
  }
  return { neta, nFacturas: facturasConLinea.size, ventaAbs, abonosAbs };
}

// ─── Handlers ──────────────────────────────────────────────────────────

async function handleVentasNetas(
  supabase: ReturnType<typeof createClient>,
  empId: string, desde: string, hasta: string,
  ids: Set<string> | null, artIds: Set<string> | null,
): Promise<number> {
  if (artIds) return (await netaPorLineas(supabase, empId, desde, hasta, ids, artIds)).neta;
  const filas = await filasFacturas(supabase, empId, desde, hasta, ids, 'id, fecha, tipo_documento, total, cliente_id');
  return filas.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
}

async function handleUnidades(
  supabase: ReturnType<typeof createClient>,
  empId: string, desde: string, hasta: string,
  ids: Set<string> | null, artIds: Set<string> | null,
): Promise<number> {
  const filas = await filasFacturas(supabase, empId, desde, hasta, ids, 'id');
  if (filas.length === 0) return 0;
  const lineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, cantidad', filas.map((f) => f.id));
  if (artIds) {
    return lineas.filter((l) => artIds.has(l.articulo_id ?? ''))
      .reduce((s, l) => s + Number(l.cantidad ?? 0), 0);
  }
  return lineas.reduce((s, l) => s + Number(l.cantidad ?? 0), 0);
}

async function handleNumClientes(
  supabase: ReturnType<typeof createClient>,
  empId: string, desde: string, hasta: string,
  ids: Set<string> | null,
): Promise<number> {
  const filas = await filasFacturas(supabase, empId, desde, hasta, ids, 'cliente_id');
  return new Set(filas.filter((f) => f.cliente_id).map((f) => f.cliente_id)).size;
}

async function handleTicketMedio(
  supabase: ReturnType<typeof createClient>,
  empId: string, desde: string, hasta: string,
  ids: Set<string> | null, artIds: Set<string> | null,
): Promise<number> {
  if (artIds) {
    const r = await netaPorLineas(supabase, empId, desde, hasta, ids, artIds);
    return r.nFacturas > 0 ? r.neta / r.nFacturas : 0;
  }
  const filas = await filasFacturas(supabase, empId, desde, hasta, ids, 'id, tipo_documento, total, cliente_id');
  const neta = filas.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const nFacturas = filas.filter((f) => f.tipo_documento !== 'abono').length;
  return nFacturas > 0 ? neta / nFacturas : 0;
}

async function handleDso(
  supabase: ReturnType<typeof createClient>,
  empId: string, ids: Set<string> | null,
): Promise<number> {
  const hoy = new Date();

  let clientes: Set<string> | null = null;
  if (ids && ids.size > 0) {
    clientes = new Set();
    for (const lote of trocear([...ids])) {
      const { data } = await supabase.from('facturas').select('cliente_id').in('id', lote);
      for (const r of (data ?? []) as { cliente_id: string | null }[]) {
        if (r.cliente_id) clientes.add(r.cliente_id);
      }
    }
    if (clientes.size === 0) return 0;
  }

  let saldo = 0;
  if (clientes) {
    for (const lote of trocear([...clientes])) {
      const { data } = await supabase
        .from('v_aging')
        .select('pendiente')
        .eq('empresa_id', empId)
        .in('cliente_id', [...lote]);
      saldo += (data ?? []).reduce((s: number, r: { pendiente: number }) => s + Number(r.pendiente ?? 0), 0);
    }
  } else {
    const { data } = await supabase.from('v_aging').select('pendiente').eq('empresa_id', empId);
    saldo = (data ?? []).reduce((s: number, r: { pendiente: number }) => s + Number(r.pendiente ?? 0), 0);
  }

  const haceAnio = new Date(hoy); haceAnio.setFullYear(haceAnio.getFullYear() - 1);
  const desde = haceAnio.toISOString().slice(0, 10);
  const hasta = hoy.toISOString().slice(0, 10);

  let neta12m = 0;
  if (clientes) {
    for (const lote of trocear([...clientes])) {
      const { data } = await supabase
        .from('facturas')
        .select('tipo_documento, total')
        .eq('empresa_id', empId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .in('cliente_id', [...lote]);
      neta12m += (data ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
    }
  } else {
    const { data } = await supabase
      .from('facturas')
      .select('tipo_documento, total')
      .eq('empresa_id', empId)
      .gte('fecha', desde)
      .lte('fecha', hasta);
    neta12m = (data ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  }

  return neta12m > 0 ? saldo / (neta12m / 365) : 0;
}

async function handlePctDevoluciones(
  supabase: ReturnType<typeof createClient>,
  empId: string, desde: string, hasta: string,
  ids: Set<string> | null, artIds: Set<string> | null,
): Promise<number> {
  if (artIds) {
    const r = await netaPorLineas(supabase, empId, desde, hasta, ids, artIds);
    const total = r.ventaAbs + r.abonosAbs;
    return total > 0 ? (r.abonosAbs / total) * 100 : 0;
  }
  const filas = await filasFacturas(supabase, empId, desde, hasta, ids, 'tipo_documento, total, cliente_id');
  const total = filas.reduce((s, f) => s + Math.abs(Number(f.total ?? 0)), 0);
  const abonos = filas.filter((f) => f.tipo_documento === 'abono').reduce((s, f) => s + Math.abs(Number(f.total ?? 0)), 0);
  return total > 0 ? (abonos / total) * 100 : 0;
}

async function handleCumplimiento(
  supabase: ReturnType<typeof createClient>,
  empId: string, anio: number,
  ids: Set<string> | null, artIds: Set<string> | null,
  filtros: KpiConfig['filtros'],
): Promise<number> {
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;
  const neta = artIds
    ? (await netaPorLineas(supabase, empId, desde, hasta, ids, artIds)).neta
    : await handleVentasNetas(supabase, empId, desde, hasta, ids, null);

  let pq = supabase.from('presupuesto').select('importe').eq('empresa_id', empId).eq('ejercicio', anio);
  if (filtros?.cliente_id) pq = pq.eq('cliente_id', filtros.cliente_id);
  if (filtros?.comercial_id) pq = pq.eq('comercial_id', filtros.comercial_id);
  if (filtros?.familia_id) pq = pq.eq('familia_id', filtros.familia_id);
  const { data } = await pq;
  const presupuesto = (data ?? []).reduce((s: number, r: { importe: number }) => s + Number(r.importe ?? 0), 0);
  return presupuesto > 0 ? (neta / presupuesto) * 100 : 0;
}

async function handleMargen(
  supabase: ReturnType<typeof createClient>,
  empId: string, desde: string, hasta: string,
  ids: Set<string> | null, artIds: Set<string> | null, pct: boolean,
): Promise<number> {
  const filas = await filasFacturas(supabase, empId, desde, hasta, ids, 'id, tipo_documento, cliente_id');
  if (filas.length === 0) return 0;

  const lineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, importe, cantidad, articulo_id', filas.map((f) => f.id));
  const tipadas = artIds ? lineas.filter((l) => artIds.has(l.articulo_id ?? '')) : lineas;
  const artIdsTodas = [...new Set(tipadas.filter((l) => l.articulo_id).map((l) => l.articulo_id!))];
  const articulosMap = new Map<string, number>();
  if (artIdsTodas.length) {
    const { data: arts } = await supabase.from('articulos').select('id, coste_unitario').in('id', artIdsTodas);
    for (const a of (arts ?? []) as FilaArticulo[]) articulosMap.set(a.id, Number(a.coste_unitario ?? 0));
  }

  const tipoMap = new Map(filas.map((f) => [f.id, f.tipo_documento]));
  let totalVenta = 0;
  let totalCoste = 0;
  for (const l of tipadas) {
    const signo = tipoMap.get(l.factura_id) === 'abono' ? -1 : 1;
    totalVenta += Number(l.importe ?? 0) * signo;
    const cu = articulosMap.get(l.articulo_id ?? '') ?? 0;
    totalCoste += cu * Number(l.cantidad ?? 0) * signo;
  }
  const margen = totalVenta - totalCoste;
  return pct ? (totalVenta > 0 ? (margen / totalVenta) * 100 : 0) : margen;
}

// ─── Motor principal ───────────────────────────────────────────────────

export async function evaluarKpi(cfg: KpiConfig, codigoEmpresa: string): Promise<ResultadoKpi> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const { anio, desde, hasta } = parseFiltros(cfg);
  const metrica = cfg.metrica as MetricaClave;
  const calculo = cfg.calculo;

  const ids = await resolverIds(supabase, empresa.id, cfg, desde, hasta);
  const artIds = await artIdsFiltro(supabase, empresa.id, cfg.filtros);

  // Si es yoy, calcular prev year
  if (calculo === 'yoy') {
    const valor = await resolverMetrica(supabase, empresa.id, metrica, desde, hasta, ids, artIds, cfg);
    const desdePrev = `${anio - 1}${desde.slice(4)}`;
    const hastaPrev = `${anio - 1}${hasta.slice(4)}`;
    const idsPrev = await resolverIds(supabase, empresa.id, cfg, desdePrev, hastaPrev);
    const valorPrev = await resolverMetrica(supabase, empresa.id, metrica, desdePrev, hastaPrev, idsPrev, artIds, cfg);
    return { valor: valorPrev !== 0 ? ((valor - valorPrev) / Math.abs(valorPrev)) * 100 : null, formato: cfg.formato ?? 'pct' };
  }

  if (calculo === 'pct_total') {
    const cfgSinFiltros = { ...cfg, filtros: { ejercicio: cfg.filtros?.ejercicio, fecha_desde: cfg.filtros?.fecha_desde, fecha_hasta: cfg.filtros?.fecha_hasta } };
    const idsTotal = await resolverIds(supabase, empresa.id, cfgSinFiltros, desde, hasta);
    const valor = await resolverMetrica(supabase, empresa.id, metrica, desde, hasta, ids, artIds, cfg);
    const valorTotal = await resolverMetrica(supabase, empresa.id, metrica, desde, hasta, idsTotal, null, cfgSinFiltros);
    return { valor: valorTotal > 0 ? (valor / valorTotal) * 100 : null, formato: 'pct' };
  }

  const valor = await resolverMetrica(supabase, empresa.id, metrica, desde, hasta, ids, artIds, cfg);
  return { valor, formato: cfg.formato ?? METRICAS[metrica]?.formatoDefault ?? 'numero' };
}

async function resolverMetrica(
  supabase: ReturnType<typeof createClient>,
  empId: string,
  metrica: MetricaClave,
  desde: string,
  hasta: string,
  ids: Set<string> | null,
  artIds: Set<string> | null,
  cfg: KpiConfig,
): Promise<number> {
  switch (metrica) {
    case 'ventas_netas':
      return handleVentasNetas(supabase, empId, desde, hasta, ids, artIds);
    case 'unidades':
      return handleUnidades(supabase, empId, desde, hasta, ids, artIds);
    case 'num_clientes':
      return handleNumClientes(supabase, empId, desde, hasta, ids);
    case 'ticket_medio':
      return handleTicketMedio(supabase, empId, desde, hasta, ids, artIds);
    case 'dso':
      return handleDso(supabase, empId, ids);
    case 'pct_devoluciones':
      return handlePctDevoluciones(supabase, empId, desde, hasta, ids, artIds);
    case 'cumplimiento':
      return handleCumplimiento(supabase, empId, cfg.filtros?.ejercicio ? Number(cfg.filtros.ejercicio) : new Date().getFullYear(), ids, artIds, cfg.filtros);
    case 'margen_pct':
      return handleMargen(supabase, empId, desde, hasta, ids, artIds, true);
    case 'margen_abs':
      return handleMargen(supabase, empId, desde, hasta, ids, artIds, false);
    default:
      return 0;
  }
}