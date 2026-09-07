import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getArticuloIdsFiltrados, type Filtros } from '@/lib/datos/filtros';

export type StockData = {
  empresa: { id: string; codigo: string; nombre: string };
  valorStock: number;
  valorTrasito: number;
  coberturaMedia: number;
  roturas: number;
  bajoPuntoPedido: number;
  bajoPunto: { articulo: string; almacen: string; disponible: number; punto: number; cobertura: number | null; transito: number }[];
  peorCobertura: { articulo: string; almacen: string; disponible: number; cobertura: number | null }[];
  aprovisionamiento: { articulo: string; almacen: string; disponible: number; mediaDiaria: number; transito: number; propuesta: number }[];
  rotacionMedia: number | null;
  rotacionTop: { articulo: string; unidadesVendidas: number; stockMedio: number; rotacion: number }[];
  fillRate: number | null;
  ventaPerdida: { articulo: string; unidades: number; importe: number }[];
  stockMuerto: { articulo: string; almacen: string; disponible: number; valor: number }[];
  cruceCoberturaCartera: { articulo: string; disponible: number; cubiertoDias: number | null; carteraPendiente: number; riesgo: boolean }[];
};

type FilaCobertura = {
  articulo_id: string;
  articulo: string;
  almacen: string;
  punto_pedido: number;
  stock_disponible: number;
  consumo_medio_diario: number;
  cobertura_dias: number | null;
  en_transito: number;
};

export const PLAZO_REPOSICION_DIAS = 60;
export const DIAS_SEGURIDAD = 15;

export async function getStock(codigoEmpresa: string, filtros?: Filtros): Promise<StockData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const idsArticulo = await getArticuloIdsFiltrados(supabase, empresa.id, filtros ?? {});

  const { data: filas } = await supabase
    .from('v_stock_cobertura')
    .select('articulo_id, articulo, almacen, punto_pedido, stock_disponible, consumo_medio_diario, cobertura_dias, en_transito')
    .eq('empresa_id', empresa.id);
  const rows = ((filas ?? []) as FilaCobertura[]).filter((r) => !idsArticulo || idsArticulo.has(r.articulo_id));

  const { data: arts } = await supabase.from('articulos').select('id, coste_unitario').eq('empresa_id', empresa.id);
  const costeUnit = new Map<string, number>();
  for (const a of arts ?? []) {
    const costo = Number((a as { coste_unitario: number | null }).coste_unitario ?? 0);
    costeUnit.set((a as { id: string }).id, costo);
  }

  let valorStock = 0;
  let valorTrasito = 0;
  let coberturaSum = 0;
  let coberturaN = 0;
  const roturas = new Set<string>();
  const bajoPunto: StockData['bajoPunto'] = [];
  const peorCobertura: StockData['peorCobertura'] = [];
  const aprovisionamiento: StockData['aprovisionamiento'] = [];

  for (const r of rows) {
    const coste = costeUnit.get(r.articulo_id) ?? 0;
    valorStock += Number(r.stock_disponible ?? 0) * coste;
    valorTrasito += Number(r.en_transito ?? 0) * coste;
    const cobertura = r.cobertura_dias != null ? Number(r.cobertura_dias) : null;
    if (cobertura !== null) {
      coberturaSum += cobertura;
      coberturaN += 1;
    }
    const disponible = Number(r.stock_disponible ?? 0);
    const punto = Number(r.punto_pedido ?? 0);
    const mediaDiaria = Number(r.consumo_medio_diario ?? 0);
    const transito = Number(r.en_transito ?? 0);
    if (disponible <= 0) roturas.add(r.articulo_id);
    if (punto > 0 && disponible < punto) {
      bajoPunto.push({ articulo: r.articulo, almacen: r.almacen, disponible, punto, cobertura, transito });
    }
    peorCobertura.push({ articulo: r.articulo, almacen: r.almacen, disponible, cobertura });

    if (mediaDiaria > 0) {
      const propuesta = Math.max(
        0,
        Math.round(mediaDiaria * (PLAZO_REPOSICION_DIAS + DIAS_SEGURIDAD) - disponible - transito),
      );
      if (propuesta > 0) {
        aprovisionamiento.push({
          articulo: r.articulo,
          almacen: r.almacen,
          disponible,
          mediaDiaria,
          transito,
          propuesta,
        });
      }
    }
  }

  bajoPunto.sort((a, b) => a.disponible - b.disponible).slice(0, 15);
  peorCobertura
    .filter((x) => x.cobertura !== null)
    .sort((a, b) => (a.cobertura ?? Infinity) - (b.cobertura ?? Infinity))
    .slice(0, 12);
  aprovisionamiento.sort((a, b) => b.propuesta - a.propuesta).slice(0, 15);

  const desde12m = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const { data: consumoRaw } = await supabase
    .from('v_consumo_diario')
    .select('articulo_id, unidades')
    .eq('empresa_id', empresa.id)
    .gte('fecha', desde12m);
  const ventasArticulo = new Map<string, number>();
  for (const c of consumoRaw ?? []) {
    const id = (c as { articulo_id: string }).articulo_id;
    ventasArticulo.set(id, (ventasArticulo.get(id) ?? 0) + Number((c as { unidades: number }).unidades ?? 0));
  }
  const stockPorArticulo = new Map<string, number>();
  for (const r of rows) {
    stockPorArticulo.set(r.articulo_id, (stockPorArticulo.get(r.articulo_id) ?? 0) + Number(r.stock_disponible ?? 0));
  }
  const rotaciones: { articulo: string; unidadesVendidas: number; stockMedio: number; rotacion: number }[] = [];
  const rotacionSum: { n: number; total: number } = { n: 0, total: 0 };
  for (const r of rows) {
    const vendidas = ventasArticulo.get(r.articulo_id) ?? 0;
    const stock = stockPorArticulo.get(r.articulo_id) ?? 0;
    if (stock > 0 && vendidas > 0) {
      const rot = vendidas / stock;
      rotacionSum.n += 1;
      rotacionSum.total += rot;
    }
  }
  const rotacionMedia = rotacionSum.n > 0 ? rotacionSum.total / rotacionSum.n : null;
  for (const r of rows) {
    const vendidas = ventasArticulo.get(r.articulo_id) ?? 0;
    const stock = stockPorArticulo.get(r.articulo_id) ?? 0;
    if (stock > 0 && vendidas > 0) {
      rotaciones.push({ articulo: r.articulo, unidadesVendidas: vendidas, stockMedio: stock, rotacion: vendidas / stock });
    }
  }
  const rotacionTop = rotaciones.sort((a, b) => b.rotacion - a.rotacion).slice(0, 10);

  const { data: pedidosS } = await supabase
    .from('pedidos')
    .select('id, estado')
    .eq('empresa_id', empresa.id)
    .in('estado', ['servido', 'parcial', 'captado', 'aceptado']);
  const pedidosEstados = (pedidosS ?? []) as { id: string; estado: string }[];
  const porIdServ = new Map(pedidosEstados.map((p) => [p.id, p.estado]));
  let fillNum = 0;
  let fillDen = 0;
  let estimationLost = 0;
  const ventaPerdidaRaw = new Map<string, { unidades: number; importe: number; nombre: string }>();
  if (pedidosEstados.length) {
    const { data: lineasS } = await supabase
      .from('pedido_lineas')
      .select('pedido_id, articulo_id, cantidad, cantidad_servida, precio_unitario, descuento_pct')
      .in('pedido_id', pedidosEstados.map((p) => p.id));
    for (const l of (lineasS ?? []) as {
      pedido_id: string;
      articulo_id: string | null;
      cantidad: number;
      cantidad_servida: number;
      precio_unitario: number;
      descuento_pct: number;
    }[]) {
      const estado = porIdServ.get(l.pedido_id);
      if (!estado || estado === 'anulado') continue;
      const cant = Number(l.cantidad ?? 0);
      const serv = Number(l.cantidad_servida ?? 0);
      if (estado !== 'captado' && estado !== 'aceptado') {
        fillDen += cant;
        fillNum += Math.min(cant, serv);
      }
      if (serv < cant && (estado === 'servido' || estado === 'parcial')) {
        const importePerdido = Math.max(0, cant - serv) * Number(l.precio_unitario ?? 0) * (1 - (Number(l.descuento_pct ?? 0) / 100));
        estimationLost += importePerdido;
        const clave = l.articulo_id ?? 'desconocido';
        const v = ventaPerdidaRaw.get(clave) ?? { unidades: 0, importe: 0, nombre: 'Desconocido' };
        v.unidades += Math.max(0, cant - serv);
        v.importe += importePerdido;
        ventaPerdidaRaw.set(clave, v);
      }
    }
  }
  const fillRate = fillDen > 0 ? (fillNum / fillDen) * 100 : null;
  const nombresArticulo = new Map<string, string>();
  {
    for (const r of rows) nombresArticulo.set(r.articulo_id, r.articulo);
  }
  {
    const idsV = [...ventaPerdidaRaw.keys()].filter((id) => id !== 'desconocido');
    if (idsV.length) {
      const { data: artsV } = await supabase.from('articulos').select('id, nombre').in('id', idsV);
      for (const a of artsV ?? []) {
        const art = a as { id: string; nombre: string };
        if (!ventaPerdidaRaw.has(art.id)) continue;
        const v = ventaPerdidaRaw.get(art.id)!;
        v.nombre = art.nombre;
        ventaPerdidaRaw.set(art.id, v);
      }
    }
  }
  const ventaPerdida = [...ventaPerdidaRaw.entries()]
    .map(([, v]) => ({ articulo: v.nombre, unidades: v.unidades, importe: v.importe }))
    .sort((a, b) => b.importe - a.importe)
    .slice(0, 10);

  const stockMuerto: StockData['stockMuerto'] = [];
  for (const r of rows) {
    const disponible = Number(r.stock_disponible ?? 0);
    const cobertura = r.cobertura_dias != null ? Number(r.cobertura_dias) : null;
    if (disponible <= 0) continue;
    if (cobertura === null || cobertura > 365) {
      stockMuerto.push({ articulo: r.articulo, almacen: r.almacen, disponible, valor: disponible * (costeUnit.get(r.articulo_id) ?? 0) });
    }
  }
  stockMuerto.sort((a, b) => b.valor - a.valor).slice(0, 15);

  const carteraArticulo = new Map<string, number>();
  if (pedidosEstados.length) {
    const { data: lineasC } = await supabase
      .from('pedido_lineas')
      .select('pedido_id, articulo_id, cantidad, cantidad_servida, precio_unitario, descuento_pct')
      .in('pedido_id', pedidosEstados.map((p) => p.id));
    const carteraSet = new Set(['captado', 'aceptado', 'parcial']);
    for (const l of (lineasC ?? []) as { pedido_id: string; articulo_id: string | null; cantidad: number; cantidad_servida: number }[]) {
      const estado = porIdServ.get(l.pedido_id);
      if (!estado || !carteraSet.has(estado) || !l.articulo_id) continue;
      const pend = Math.max(0, Number(l.cantidad ?? 0) - Number(l.cantidad_servida ?? 0));
      carteraArticulo.set(l.articulo_id, (carteraArticulo.get(l.articulo_id) ?? 0) + pend);
    }
  }
  const cruceCoberturaCartera: StockData['cruceCoberturaCartera'] = [];
  for (const r of rows) {
    const pendiente = carteraArticulo.get(r.articulo_id) ?? 0;
    if (pendiente <= 0) continue;
    const disponible = Number(r.stock_disponible ?? 0);
    cruceCoberturaCartera.push({
      articulo: r.articulo,
      disponible,
      cubiertoDias: r.cobertura_dias != null ? Number(r.cobertura_dias) : null,
      carteraPendiente: pendiente,
      riesgo: disponible < pendiente,
    });
  }
  cruceCoberturaCartera
    .sort((a, b) => Number(b.riesgo) - Number(a.riesgo) || b.carteraPendiente - a.carteraPendiente)
    .slice(0, 15);

  return {
    empresa,
    valorStock,
    valorTrasito,
    coberturaMedia: coberturaN > 0 ? coberturaSum / coberturaN : 0,
    roturas: roturas.size,
    bajoPuntoPedido: bajoPunto.length,
    bajoPunto,
    peorCobertura,
    aprovisionamiento,
    rotacionMedia,
    rotacionTop,
    fillRate,
    ventaPerdida,
    stockMuerto,
    cruceCoberturaCartera,
  };
}