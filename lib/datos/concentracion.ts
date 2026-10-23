import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { filtrarPorIds, getFacturaIdsFiltradas, type Filtros } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';
import { enLotes, todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';

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
  riesgoProveedor: {
    proveedor: string;
    pais: string;
    plazo: number;
    plazoReal: number | null;
    volumen: number;
    pctVolumen: number;
    chino: boolean;
    plazoAlto: boolean;
  }[];
};

export const UMBRAL_FAMILIA_RELEVANTE = 0.08;
export const UMBRAL_CLIENTE_DE_FAMILIA = 0.7;
export const PLAZO_PROVEEDOR_ALTO_DIAS = 75;

type Fila = { id: string; cliente_id: string | null; fecha: string; base_imponible: number; tipo_documento: string };
type FilaLinea = { factura_id: string; articulo_id: string | null; importe: number };
type FilaArticulo = { id: string; nombre: string; familia: string | null };
type FilaCliente = { id: string; nombre: string; pais_facturacion: string | null };

const NOMBRE_PAIS: Record<string, string> = {
  ES: 'España',
  IT: 'Italia',
  FR: 'Francia',
  DE: 'Alemania',
  PT: 'Portugal',
};

const DIA_MS = 86400000;

async function getRiesgoProveedorList(supabase: ReturnType<typeof createClient>, empresaId: string): Promise<ConcentracionData['riesgoProveedor']> {
  const [proveedores, gastos] = await Promise.all([
    todasLasFilas<{ codigo_erp: string; nombre: string; pais: string | null; plazo_suministro: number | null }>((desde) =>
      supabase
        .from('proveedores')
        .select('codigo_erp, nombre, pais, plazo_suministro')
        .eq('empresa_id', empresaId)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    todasLasFilas<{ proveedor_codigo: string; base_imponible: number | null }>((desde) =>
      supabase
        .from('gastos_logistica')
        .select('proveedor_codigo, base_imponible')
        .eq('empresa_id', empresaId)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
  ]);

  const proveedorPorCodigo = new Map<string, { nombre: string; pais: string | null; plazo_suministro: number | null }>();
  for (const p of proveedores) {
    if (p.codigo_erp) proveedorPorCodigo.set(String(p.codigo_erp).trim(), p);
  }

  const volumen = new Map<string, number>();
  for (const g of gastos) {
    const codigo = String(g.proveedor_codigo ?? '').trim();
    if (!codigo) continue;
    volumen.set(codigo, (volumen.get(codigo) ?? 0) + Number(g.base_imponible ?? 0));
  }
  let volumenTotal = 0;
  for (const v of volumen.values()) volumenTotal += v;

  return [...volumen.entries()]
    .filter(([, v]) => v > 0)
    .map(([codigo, vol]) => {
      const p = proveedorPorCodigo.get(codigo);
      const plazo = Number(p?.plazo_suministro ?? 0);
      const pais = p?.pais ?? '—';
      return {
        proveedor: p?.nombre ?? codigo,
        pais,
        plazo,
        plazoReal: null,
        volumen: vol,
        pctVolumen: volumenTotal > 0 ? (vol / volumenTotal) * 100 : 0,
        chino: pais.toLowerCase() === 'china',
        plazoAlto: plazo > PLAZO_PROVEEDOR_ALTO_DIAS,
      };
    })
    .sort((a, b) => b.volumen - a.volumen);
}

export async function getConcentracion(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<ConcentracionData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const [idsFiltrados, filasRes, clisRes, articulosRes, riesgoProveedor] = await Promise.all([
    getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`),
    todasLasFilas<Fila>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, fecha, base_imponible, tipo_documento')
        .eq('empresa_id', empresa.id)
        .gte('fecha', `${anio}-01-01`)
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    todasLasFilas<FilaCliente>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre, pais_facturacion')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    todasLasFilas<FilaArticulo>((desde) =>
      supabase
        .from('articulos')
        .select('id, nombre, familia')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    getRiesgoProveedorList(supabase, empresa.id),
  ]);
  const filas = filtrarPorIds(filasRes, idsFiltrados);

  const porCliente = new Map<string, number>();
  let netaTotal = 0;
  const tipoPorFactura = new Map<string, string>();
  for (const f of filas) {
    tipoPorFactura.set(f.id, f.tipo_documento);
    const base = Number(f.base_imponible ?? 0);
    netaTotal += base;
    if (f.cliente_id) porCliente.set(f.cliente_id, (porCliente.get(f.cliente_id) ?? 0) + base);
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

  const clis = clisRes as FilaCliente[];
  const nombreCliente = new Map(clis.map((c) => [c.id, c.nombre]));
  const paisCliente = new Map(clis.map((c) => [c.id, c.pais_facturacion]));

  let acumulado = 0;
  const pareto = orden.map(([id, neta]) => {
    acumulado += neta;
    return { nombre: nombreCliente.get(id) ?? '—', neta, pct: pctOf(neta), acumulado: pctOf(acumulado) };
  }).slice(0, 15);

  const articulos = articulosRes as FilaArticulo[];
  const articuloPorId = new Map(articulos.map((a) => [a.id, a]));
  const familiaDeArticulo = new Map(articulos.map((a) => [a.id, a.familia]));

  const porArticulo = new Map<string, { nombre: string; neta: number }>();
  const porFamilia = new Map<string, number>();
  const clienteDeLinea = new Map<string, string | null>();
  for (const f of filas) clienteDeLinea.set(f.id, f.cliente_id);
  const porFamiliaPorCliente = new Map<string, Map<string, number>>();

  if (filas.length) {
    const lineasRaw = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, importe', filas.map((f) => f.id));
    for (const l of lineasRaw) {
      const sign = tipoPorFactura.get(l.factura_id) === 'abono' ? -1 : 1;
      const importe = sign * Number(l.importe ?? 0);
      if (importe === 0) continue;
      if (l.articulo_id) {
        const a = articuloPorId.get(l.articulo_id);
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
    .map(([familia, neta]) => ({ familia, neta, pct: pctOf(neta) }))
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
        familia: fam,
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
    riesgoProveedor,
  };
}