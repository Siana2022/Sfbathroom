import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import type { Filtros } from '@/lib/datos/filtros';

export type AgingBucket = { label: string; min: number; max: number | null; importe: number };

export type ClienteCredito = {
  id: string;
  nombre: string;
  saldo: number;
  vencido: number;
  limite: number | null;
  riesgoVivo: number;
  consumoLimitePct: number | null;
  dso: number | null;
  dsoDelta: number | null;
};

export type CobrosData = {
  empresa: { id: string; codigo: string; nombre: string };
  saldoTotal: number;
  vencido: number;
  enCarteraFuturo: number;
  dso: number | null;
  dsoDesvioDias: number;
  dsoDesvioEuros: number;
  riesgoVivoTotal: number;
  buckets: AgingBucket[];
  porCliente: ClienteCredito[];
};

type FilaAging = { cliente_id: string | null; pendiente: number; dias_vencido: number };
type FilaFactura = { id: string; cliente_id: string | null; total: number; tipo_documento: string; fecha: string };
type FilaCobro = { cliente_id: string | null; importe: number; impagado: boolean; fecha: string };
type FilaPedido = { cliente_id: string | null; importe: number | null };

const TIPOS_SALDO = new Set(['factura', 'nota_cargo']);
const DIAS_PACTADOS = 30;
const DIAS_REPASO = 30;

const DIA_MS = 86400000;

export async function getCobros(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<CobrosData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const clienteId = filtros?.cliente;

  let agingQuery = supabase
    .from('v_aging')
    .select('cliente_id, pendiente, dias_vencido')
    .eq('empresa_id', empresa.id);
  if (clienteId) agingQuery = agingQuery.eq('cliente_id', clienteId);
  const { data: aging } = await agingQuery;
  const filas = (aging ?? []) as FilaAging[];

  let saldoTotal = 0;
  let vencidoTotal = 0;
  let netaAnio = 0;

  {
    let netaQuery = supabase
      .from('facturas')
      .select('total')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    if (clienteId) netaQuery = netaQuery.eq('cliente_id', clienteId);
    const { data: neta } = await netaQuery;
    for (const f of neta ?? []) netaAnio += Number((f as { total: number }).total ?? 0);
  }

  const buckets: AgingBucket[] = [
    { label: 'Al día (futuro)', min: -Infinity, max: -0.000001, importe: 0 },
    { label: 'Vencido 1-30', min: 0, max: 30, importe: 0 },
    { label: 'Vencido 31-60', min: 31, max: 60, importe: 0 },
    { label: 'Vencido 61-90', min: 61, max: 90, importe: 0 },
    { label: 'Vencido +90', min: 91, max: null, importe: 0 },
  ];

  const vencidoPorCliente = new Map<string, number>();
  for (const f of filas) {
    const pend = Number(f.pendiente ?? 0);
    if (pend <= 0) continue;
    const dias = Number(f.dias_vencido ?? 0);
    saldoTotal += pend;
    if (dias >= 0) vencidoTotal += pend;
    for (const b of buckets) {
      const enRango = dias >= b.min && (b.max === null || dias <= b.max);
      if (enRango) b.importe += pend;
    }
    if (f.cliente_id && dias >= 0) {
      vencidoPorCliente.set(f.cliente_id, (vencidoPorCliente.get(f.cliente_id) ?? 0) + pend);
    }
  }

  const dso = netaAnio > 0 ? saldoTotal / (netaAnio / 365) : null;
  const dsoDesvioDias = dso !== null ? Math.max(0, dso - DIAS_PACTADOS) : 0;
  const dsoDesvioEuros = (saldoTotal / 365) * dsoDesvioDias;

  const hoy = Math.floor(Date.now() / DIA_MS);
  const hoyMenosRepaso = hoy - DIAS_REPASO;

  let facturasQuery = supabase
    .from('facturas')
    .select('id, cliente_id, total, tipo_documento, fecha')
    .eq('empresa_id', empresa.id)
    .in('tipo_documento', ['factura', 'nota_cargo'])
    .gte('fecha', new Date((hoy - 400) * DIA_MS).toISOString().slice(0, 10));
  if (clienteId) facturasQuery = facturasQuery.eq('cliente_id', clienteId);
  const { data: facturasRaw } = await facturasQuery;
  const facturas = (facturasRaw ?? []) as unknown as FilaFactura[];

  let cobrosQuery = supabase
    .from('cobros')
    .select('cliente_id, importe, impagado, fecha')
    .eq('empresa_id', empresa.id);
  if (clienteId) cobrosQuery = cobrosQuery.eq('cliente_id', clienteId);
  const { data: cobrosRaw } = await cobrosQuery;
  const cobros = ((cobrosRaw ?? []) as unknown as FilaCobro[]).filter((c) => !c.impagado);

  let pedidosQuery = supabase
    .from('pedidos')
    .select('cliente_id, importe')
    .eq('empresa_id', empresa.id)
    .in('estado', ['captado', 'aceptado', 'parcial']);
  if (clienteId) pedidosQuery = pedidosQuery.eq('cliente_id', clienteId);
  const { data: pedidosRaw } = await pedidosQuery;
  const pedidos = (pedidosRaw ?? []) as unknown as FilaPedido[];

  let clisQuery = supabase.from('clientes').select('id, nombre, limite_credito').eq('empresa_id', empresa.id);
  if (clienteId) clisQuery = clisQuery.eq('id', clienteId);
  const { data: clisRaw } = await clisQuery;
  const clientes = (clisRaw ?? []) as unknown as { id: string; nombre: string; limite_credito: number | null }[];

  const carteraPedido = new Map<string, number>();
  let riesgoVivoTotal = 0;
  for (const p of pedidos) {
    if (!p.cliente_id) continue;
    const im = Number(p.importe ?? 0);
    carteraPedido.set(p.cliente_id, (carteraPedido.get(p.cliente_id) ?? 0) + im);
    riesgoVivoTotal += im;
  }
  riesgoVivoTotal += saldoTotal;

  const neta12m = new Map<string, number>();
  const saldoHoy = new Map<string, number>();
  const saldoRepaso = new Map<string, number>();
  const neta12mRepaso = new Map<string, number>();
  const sumaPorCliente = (m: Map<string, number>, cli: string, importe: number) =>
    m.set(cli, (m.get(cli) ?? 0) + importe);

  for (const f of facturas) {
    if (!f.cliente_id) continue;
    const dia = Math.floor(Date.parse(f.fecha) / DIA_MS);
    const total = Number(f.total ?? 0);
    if (TIPOS_SALDO.has(f.tipo_documento)) {
      if (dia <= hoy) sumaPorCliente(saldoHoy, f.cliente_id, total);
      if (dia <= hoyMenosRepaso) sumaPorCliente(saldoRepaso, f.cliente_id, total);
      if (dia > hoy - 365) sumaPorCliente(neta12m, f.cliente_id, total);
      if (dia > hoyMenosRepaso - 365 && dia <= hoyMenosRepaso) sumaPorCliente(neta12mRepaso, f.cliente_id, total);
    }
  }
  for (const c of cobros) {
    if (!c.cliente_id) continue;
    const dia = Math.floor(Date.parse(c.fecha) / DIA_MS);
    const importe = Number(c.importe ?? 0);
    if (dia <= hoy) sumaPorCliente(saldoHoy, c.cliente_id, -importe);
    if (dia <= hoyMenosRepaso) sumaPorCliente(saldoRepaso, c.cliente_id, -importe);
  }

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  const limiteCliente = new Map(clientes.map((c) => [c.id, c.limite_credito]));
  const claves = new Set([...saldoHoy.keys(), ...carteraPedido.keys()]);

  const porCliente: ClienteCredito[] = [...claves]
    .map((id) => {
      const saldo = saldoHoy.get(id) ?? 0;
      const netaClient = neta12m.get(id) ?? 0;
      const dsoCliente = netaClient > 0 ? saldo / (netaClient / 365) : null;
      const saldoRep = saldoRepaso.get(id) ?? 0;
      const netaClientRep = neta12mRepaso.get(id) ?? 0;
      const dsoRep = netaClientRep > 0 ? saldoRep / (netaClientRep / 365) : null;
      const limite = limiteCliente.get(id) ?? null;
      const riesgo = saldo + (carteraPedido.get(id) ?? 0);
      return {
        id,
        nombre: nombreCliente.get(id) ?? '—',
        saldo,
        vencido: vencidoPorCliente.get(id) ?? 0,
        limite,
        riesgoVivo: riesgo,
        consumoLimitePct: limite && limite > 0 ? (riesgo / limite) * 100 : null,
        dso: dsoCliente,
        dsoDelta: dsoRep !== null && dsoCliente !== null ? dsoCliente - dsoRep : null,
      };
    })
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 10);

  return {
    empresa,
    saldoTotal,
    vencido: vencidoTotal,
    enCarteraFuturo: saldoTotal - vencidoTotal,
    dso,
    dsoDesvioDias,
    dsoDesvioEuros,
    riesgoVivoTotal,
    buckets,
    porCliente,
  };
}