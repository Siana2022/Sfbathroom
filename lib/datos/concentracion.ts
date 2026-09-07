import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type ConcentracionData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  netaTotal: number;
  numClientes: number;
  top1: number | null;
  top3: number | null;
  top10: number | null;
  hhi: number;
  pareto: { nombre: string; neta: number; pct: number; acumulado: number }[];
};

type Fila = { cliente_id: string | null; fecha: string; total: number };

export async function getConcentracion(codigoEmpresa: string, anio: number): Promise<ConcentracionData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: filasRaw } = await supabase
    .from('facturas')
    .select('cliente_id, fecha, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const filas = (filasRaw ?? []) as Fila[];

  const porCliente = new Map<string, number>();
  let netaTotal = 0;
  for (const f of filas) {
    const total = Number(f.total ?? 0);
    netaTotal += total;
    if (f.cliente_id) porCliente.set(f.cliente_id, (porCliente.get(f.cliente_id) ?? 0) + total);
  }

  const orden = [...porCliente.entries()].sort((a, b) => b[1] - a[1]);
  const numClientes = orden.length;
  const pctOf = (n: number) => (netaTotal > 0 ? (n / netaTotal) * 100 : 0);

  const top = (k: number) => {
    const slice = orden.slice(0, k);
    const suma = slice.reduce((a, [, v]) => a + v, 0);
    return slice.length > 0 ? pctOf(suma) : null;
  };

  let hhi = 0;
  if (netaTotal > 0) {
    for (const [, v] of orden) {
      const share = v / netaTotal;
      hhi += share * share;
    }
  }

  const { data: clis } = await supabase.from('clientes').select('id, nombre').eq('empresa_id', empresa.id);
  const nombreCliente = new Map((clis ?? []).map((c) => [c.id, (c as { nombre: string }).nombre]));

  let acumulado = 0;
  const pareto = orden.map(([id, neta]) => {
    acumulado += neta;
    return { nombre: nombreCliente.get(id) ?? '—', neta, pct: pctOf(neta), acumulado: pctOf(acumulado) };
  }).slice(0, 15);

  return {
    empresa,
    anio,
    netaTotal,
    numClientes,
    top1: top(1),
    top3: top(3),
    top10: top(10),
    hhi: hhi * 10000,
    pareto,
  };
}