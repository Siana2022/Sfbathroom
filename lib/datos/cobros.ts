import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type AgingBucket = { label: string; min: number; max: number | null; importe: number };

export type CobrosData = {
  empresa: { id: string; codigo: string; nombre: string };
  saldoTotal: number;
  vencido: number;
  enCarteraFuturo: number;
  dso: number | null;
  buckets: AgingBucket[];
  porCliente: { id: string; nombre: string; saldo: number; vencido: number }[];
};

type FilaAging = { cliente_id: string | null; pendiente: number; dias_vencido: number };
type FilaSaldo = { cliente_id: string; saldo_total: number; vencido: number };

export async function getCobros(codigoEmpresa: string, anio: number): Promise<CobrosData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: aging } = await supabase
    .from('v_aging')
    .select('cliente_id, pendiente, dias_vencido')
    .eq('empresa_id', empresa.id);
  const filas = (aging ?? []) as FilaAging[];

  let saldoTotal = 0;
  let vencidoTotal = 0;
  let netaAnio = 0;

  {
    const { data: neta } = await supabase
      .from('facturas')
      .select('total')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    for (const f of neta ?? []) netaAnio += Number((f as { total: number }).total ?? 0);
  }

  const buckets: AgingBucket[] = [
    { label: 'Al día (futuro)', min: -Infinity, max: -0.000001, importe: 0 },
    { label: 'Vencido 1-30', min: 0, max: 30, importe: 0 },
    { label: 'Vencido 31-60', min: 31, max: 60, importe: 0 },
    { label: 'Vencido 61-90', min: 61, max: 90, importe: 0 },
    { label: 'Vencido +90', min: 91, max: null, importe: 0 },
  ];

  const porClienteRaw = new Map<string, { saldo: number; vencido: number }>();
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
    if (f.cliente_id) {
      const c = porClienteRaw.get(f.cliente_id) ?? { saldo: 0, vencido: 0 };
      c.saldo += pend;
      if (dias >= 0) c.vencido += pend;
      porClienteRaw.set(f.cliente_id, c);
    }
  }

  const dso = netaAnio > 0 ? (saldoTotal / (netaAnio / 365)) : null;

  const porClienteIds = [...porClienteRaw.entries()].sort((a, b) => b[1].saldo - a[1].saldo).slice(0, 10).map(([id]) => id);
  const nombreCliente = new Map<string, string>();
  if (porClienteIds.length) {
    const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', porClienteIds);
    for (const c of clis ?? []) nombreCliente.set((c as { id: string }).id, (c as { nombre: string }).nombre);
  }
  const porCliente = [...porClienteRaw.entries()]
    .filter(([id]) => porClienteIds.includes(id))
    .map(([id, v]) => ({ id, nombre: nombreCliente.get(id) ?? '—', saldo: v.saldo, vencido: v.vencido }));

  return {
    empresa,
    saldoTotal,
    vencido: vencidoTotal,
    enCarteraFuturo: saldoTotal - vencidoTotal,
    dso,
    buckets,
    porCliente,
  };
}