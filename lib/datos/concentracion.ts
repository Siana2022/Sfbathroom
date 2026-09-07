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
  familias: { familia: string; neta: number; pct: number }[];
  pct3Familias: number;
  pctTop20Refs: number;
  refs80: number;
  porPais: { pais: string; neta: number; pct: number }[];
  riesgo: { familia: string; cliente: string; netaFamilia: number; pctCliente: number }[];
};

export const UMBRAL_FAMILIA_RELEVANTE = 0.08;
export const UMBRAL_CLIENTE_DE_FAMILIA = 0.7;

type Fila = { id: string; cliente_id: string | null; fecha: string; total: number };
type FilaLinea = { factura_id: string; articulo_id: string | null; importe: number };
type FilaArticulo = { id: string; nombre: string; familia_id: string | null };
type FilaFamilia = { id: string; nombre: string };
type FilaCliente = { id: string; nombre: string; pais_facturacion: string | null };

const NOMBRE_PAIS: Record<string, string> = {
  ES: 'España',
  IT: 'Italia',
  FR: 'Francia',
  DE: 'Alemania',
  PT: 'Portugal',
};

export async function getConcentracion(codigoEmpresa: string, anio: number): Promise<ConcentracionData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: filasRaw } = await supabase
    .from('facturas')
    .select('id, cliente_id, fecha, total')
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

  const { data: clisRaw } = await supabase.from('clientes').select('id, nombre, pais_facturacion').eq('empresa_id', empresa.id);
  const clis = (clisRaw ?? []) as FilaCliente[];
  const nombreCliente = new Map(clis.map((c) => [c.id, c.nombre]));
  const paisCliente = new Map(clis.map((c) => [c.id, c.pais_facturacion]));

  let acumulado = 0;
  const pareto = orden.map(([id, neta]) => {
    acumulado += neta;
    return { nombre: nombreCliente.get(id) ?? '—', neta, pct: pctOf(neta), acumulado: pctOf(acumulado) };
  }).slice(0, 15);

  const { data: articulosRaw } = await supabase.from('articulos').select('id, nombre, familia_id').eq('empresa_id', empresa.id);
  const articulos = (articulosRaw ?? []) as FilaArticulo[];
  const familiaDeArticulo = new Map(articulos.map((a) => [a.id, a.familia_id]));

  const { data: familiasRaw } = await supabase.from('familias_articulo').select('id, nombre').eq('empresa_id', empresa.id);
  const familias = (familiasRaw ?? []) as FilaFamilia[];
  const nombreFamilia = new Map(familias.map((f) => [f.id, f.nombre]));

  const porArticulo = new Map<string, { nombre: string; neta: number }>();
  const porFamilia = new Map<string, number>();
  const clienteDeLinea = new Map<string, string | null>();
  for (const f of filas) clienteDeLinea.set(f.id, f.cliente_id);
  const porFamiliaPorCliente = new Map<string, Map<string, number>>();

  if (filas.length) {
    const { data: lineasRaw } = await supabase
      .from('factura_lineas')
      .select('factura_id, articulo_id, importe')
      .in('factura_id', filas.map((f) => f.id));
    for (const l of (lineasRaw ?? []) as FilaLinea[]) {
      const importe = Number(l.importe ?? 0);
      if (importe === 0) continue;
      if (l.articulo_id) {
        const a = articulos.find((x) => x.id === l.articulo_id);
        const nombre = a?.nombre;
        if (a && nombre) {
          const cur = porArticulo.get(a.id) ?? { nombre, neta: 0 };
          cur.neta += importe;
          porArticulo.set(a.id, cur);
        }
        const fam = familiaDeArticulo.get(l.articulo_id);
        if (fam) {
          porFamilia.set(fam, (porFamilia.get(fam) ?? 0) + importe);
          const cli = clienteDeLinea.get(l.factura_id);
          if (cli) {
            const m = porFamiliaPorCliente.get(fam) ?? new Map<string, number>();
            m.set(cli, (m.get(cli) ?? 0) + importe);
            porFamiliaPorCliente.set(fam, m);
          }
        }
      }
    }
  }

  const famOrder = [...porFamilia.entries()].sort((a, b) => b[1] - a[1]);
  const familiasTop = famOrder
    .map(([id, neta]) => ({ familia: nombreFamilia.get(id) ?? '—', neta, pct: pctOf(neta) }))
    .slice(0, 10);
  const pct3Familias = famOrder.slice(0, 3).reduce((a, [, v]) => a + v, 0);

  const articulosOrder = [...porArticulo.entries()].sort((a, b) => b[1].neta - a[1].neta);
  const pctTop20Refs = articulosOrder.slice(0, 20).reduce((a, [, v]) => a + v.neta, 0);
  let refs80 = 0;
  let sum80 = 0;
  for (const [, v] of articulosOrder) {
    refs80 += 1;
    sum80 += v.neta;
    if (netaTotal > 0 && sum80 / netaTotal >= 0.8) break;
  }

  const porPaisRaw = new Map<string, number>();
  for (const [id, neta] of porCliente) {
    const codigo = paisCliente.get(id);
    const pais = (codigo ? NOMBRE_PAIS[codigo] : undefined) ?? 'Otro';
    porPaisRaw.set(pais, (porPaisRaw.get(pais) ?? 0) + neta);
  }
  const porPais = [...porPaisRaw.entries()]
    .map(([pais, neta]) => ({ pais, neta, pct: pctOf(neta) }))
    .sort((a, b) => b.neta - a.neta);

  const riesgo: ConcentracionData['riesgo'] = [];
  for (const [fam, neta] of famOrder) {
    if (netaTotal === 0) continue;
    if (neta / netaTotal < UMBRAL_FAMILIA_RELEVANTE) continue;
    const porClienteFam = porFamiliaPorCliente.get(fam);
    if (!porClienteFam) continue;
    let clave: string | null = null;
    let max = 0;
    for (const [cli, v] of porClienteFam) {
      if (v > max) {
        max = v;
        clave = cli;
      }
    }
    if (!clave || max <= 0) continue;
    const pctCliente = (max / neta) * 100;
    if (pctCliente >= UMBRAL_CLIENTE_DE_FAMILIA * 100) {
      riesgo.push({
        familia: nombreFamilia.get(fam) ?? '—',
        cliente: nombreCliente.get(clave) ?? '—',
        netaFamilia: neta,
        pctCliente,
      });
    }
  }
  riesgo.sort((a, b) => b.netaFamilia - a.netaFamilia);

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
    familias: familiasTop,
    pct3Familias: pctOf(pct3Familias),
    pctTop20Refs: pctOf(pctTop20Refs),
    refs80,
    porPais,
    riesgo,
  };
}