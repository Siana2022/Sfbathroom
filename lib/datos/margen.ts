import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getRol, puedeVerMargenes } from '@/lib/datos/role';
import { filtrarPorIds, getFacturaIdsFiltradas, type Filtros } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';

export type MargenData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  sinAcceso: boolean;
  importeVendido: number;
  costeVenta: number;
  margen: number;
  margenPct: number;
  porFamilia: { familia: string; importe: number; coste: number; margen: number; margenPct: number }[];
  porArticulo: { articulo: string; unidades: number; importe: number; margen: number; margenPct: number; margenUnidad: number }[];
  porComercial: { nombre: string; importe: number; margenPct: number }[];
  porMarca: { nombre: string; importe: number; margenPct: number; marcaBlanca: boolean }[];
  porCanal: { nombre: string; importe: number; margenPct: number }[];
  porPais: { nombre: string; importe: number; margenPct: number }[];
  porCliente: { nombre: string; importe: number; margenPct: number }[];
  facturasPorTramo: { tramo: string; facturas: number; importe: number }[];
  erosionTarifa: { articulo: string; unidades: number; pvd: number; tarifa: number; erosionPct: number }[];
  erosionMedia: number | null;
  matrizMargenRotacion: { tramoMargen: string; baja: number; media: number; alta: number }[];
  mensual: { mes: string; importe: number; margenPct: number }[];
  ultimosLotes: { lote: string; articulo: string; fecha: string; costeCompra: number; costeRepartido: number; costeCompleto: number }[];
};

type FilaFactura = { id: string; cliente_id: string | null; comercial_id: string | null; fecha: string; tipo_documento: string; total: number; descuento_pie: number; rappel_devengado: number };
type FilaLinea = { factura_id: string; articulo_id: string | null; cantidad: number; importe: number; coste_unitario: number | null };
type FilaArticulo = { id: string; nombre: string; familia_id: string | null; marca_id: string | null; marca_blanca_cliente_id: string | null; coste_unitario: number | null; precio_tarifa: number | null };
type FilaCliente = { id: string; nombre: string; canal_id: string | null; pais_facturacion: string | null };
type FilaFamilia = { id: string; nombre: string };
type FilaEtiqueta = { id: string; nombre: string };

const TRAMOS_MARGEN = [
  { tramo: '< 30 %', min: -Infinity, max: 30 },
  { tramo: '30-50 %', min: 30, max: 50 },
  { tramo: '50-70 %', min: 50, max: 70 },
  { tramo: '> 70 %', min: 70, max: Infinity },
];

function margenPct(importe: number, coste: number): number {
  return importe > 0 ? ((importe - coste) / importe) * 100 : 0;
}
function pushMap(m: Map<string, { importe: number; coste: number }>, clave: string, importe: number, coste: number) {
  const v = m.get(clave) ?? { importe: 0, coste: 0 };
  v.importe += importe;
  v.coste += coste;
  m.set(clave, v);
}

export async function getMargen(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<MargenData> {
  const supabase = createClient();
  const [empresa, rol] = await Promise.all([getEmpresaPorCodigo(codigoEmpresa), getRol()]);
  if (!puedeVerMargenes(rol)) {
    return {
      empresa,
      anio,
      sinAcceso: true,
      importeVendido: 0,
      costeVenta: 0,
      margen: 0,
      margenPct: 0,
      porFamilia: [],
      porArticulo: [],
      porComercial: [],
      porMarca: [],
      porCanal: [],
      porPais: [],
      porCliente: [],
      facturasPorTramo: [],
      erosionTarifa: [],
      erosionMedia: null,
      matrizMargenRotacion: [],
      mensual: [],
      ultimosLotes: [],
    };
  }

  const [idsFiltrados, facturasRes, articulosRes, familiasRes, marcasRes, canalesRes, clientesRes, comercialesRes, costeLlegadaRes, lotesRes] = await Promise.all([
    getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`),
    todasLasFilas<FilaFactura>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, comercial_id, fecha, tipo_documento, total, descuento_pie, rappel_devengado')
        .eq('empresa_id', empresa.id)
        .in('tipo_documento', ['factura', 'abono', 'nota_cargo'])
        .gte('fecha', `${anio}-01-01`)
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    supabase
      .from('articulos')
      .select('id, nombre, familia_id, marca_id, marca_blanca_cliente_id, coste_unitario, precio_tarifa')
      .eq('empresa_id', empresa.id),
    supabase.from('familias_articulo').select('id, nombre'),
    supabase.from('marcas').select('id, nombre'),
    supabase.from('canales').select('id, nombre'),
    supabase.from('clientes').select('id, nombre, canal_id, pais_facturacion').eq('empresa_id', empresa.id),
    supabase.from('comerciales').select('id, nombre'),
    supabase.from('v_coste_completo_por_lote').select('articulo_id, coste_completo_unitario, cantidad').eq('empresa_id', empresa.id),
    supabase
      .from('v_coste_completo_por_lote')
      .select('lote_id, articulo, fecha_compra, coste_unitario_compra, coste_repartido_unitario, coste_completo_unitario')
      .eq('empresa_id', empresa.id)
      .order('fecha_compra', { ascending: false }),
  ]);

  const facturas = filtrarPorIds(facturasRes, idsFiltrados);
  const ids = facturas.map((f) => f.id);

  const filasLineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, cantidad, importe, coste_unitario', ids);

  const articuloPorId = new Map<string, FilaArticulo>((articulosRes.data ?? []).map((a) => [a.id, a as FilaArticulo]));

  const familiasMap = new Map<string, string>();
  for (const f of (familiasRes.data ?? []) as FilaFamilia[]) familiasMap.set(f.id, f.nombre);
  const marcasMap = new Map<string, string>();
  for (const m of (marcasRes.data ?? []) as FilaEtiqueta[]) marcasMap.set(m.id, m.nombre);
  const canalesMap = new Map<string, string>();
  for (const c of (canalesRes.data ?? []) as FilaEtiqueta[]) canalesMap.set(c.id, c.nombre);

  const clientesPorId = new Map<string, FilaCliente>();
  for (const c of (clientesRes.data ?? []) as FilaCliente[]) clientesPorId.set(c.id, c);
  const comercialesMap = new Map<string, string>();
  for (const c of (comercialesRes.data ?? []) as FilaEtiqueta[]) comercialesMap.set(c.id, c.nombre);

  const facturaPorId = new Map(facturas.map((f) => [f.id, f]));
  // Factor de reparto de descuento_pie y rappel por línea (distribuye proporcionalmente)
  const importeLineasPorFactura = new Map<string, number>();
  for (const l of filasLineas) {
    importeLineasPorFactura.set(l.factura_id, (importeLineasPorFactura.get(l.factura_id) ?? 0) + Number(l.importe ?? 0));
  }
  const factorPorFactura = new Map<string, number>();
  for (const f of facturas) {
    const base = importeLineasPorFactura.get(f.id) ?? 0;
    const ajuste = Number(f.descuento_pie ?? 0) + Number(f.rappel_devengado ?? 0);
    factorPorFactura.set(f.id, base > 0 ? (base - ajuste) / base : 1);
  }
  // Coste completo por artículo (media ponderada de v_coste_completo_por_lote)
  const costeLlegada = new Map<string, { sum: number; qty: number }>();
  for (const l of (costeLlegadaRes.data ?? []) as { articulo_id: string; coste_completo_unitario: number | null; cantidad: number | null }[]) {
    const v = costeLlegada.get(l.articulo_id) ?? { sum: 0, qty: 0 };
    v.sum += Number(l.coste_completo_unitario ?? 0) * Number(l.cantidad ?? 0);
    v.qty += Number(l.cantidad ?? 0);
    costeLlegada.set(l.articulo_id, v);
  }

  const porFamiliaRaw = new Map<string, { importe: number; coste: number }>();
  const porArticuloRaw = new Map<string, { nombre: string; unidades: number; importe: number; coste: number }>();
  const porComercialRaw = new Map<string, { importe: number; coste: number }>();
  const porMarcaRaw = new Map<string, { marcaBlanca: boolean; importe: number; coste: number }>();
  const porCanalRaw = new Map<string, { importe: number; coste: number }>();
  const porPaisRaw = new Map<string, { importe: number; coste: number }>();
  const porClienteRaw = new Map<string, { importe: number; coste: number }>();
  const porFacturaRaw = new Map<string, { importe: number; coste: number }>();
  const porMesRaw = new Map<string, { importe: number; coste: number }>();
  const porArticuloUnides = new Map<string, number>();
  const tarifaExport = new Map<string, { nombre: string; unidades: number; importe: number; tarifa: number }>();
  let importeVendido = 0;
  let costeVenta = 0;

  for (const l of filasLineas) {
    const a = l.articulo_id ? articuloPorId.get(l.articulo_id) : undefined;
    const f = facturaPorId.get(l.factura_id);
    const c = f?.cliente_id ? clientesPorId.get(f.cliente_id) : undefined;
    const factor = factorPorFactura.get(l.factura_id) ?? 1;
    const sign = f?.tipo_documento === 'abono' ? -1 : 1;
    const importe = sign * Number(l.importe ?? 0) * factor;
    // Preferir coste de llegada completo, luego coste de línea, luego coste de artículo
    let costeUnit = Number(l.coste_unitario ?? 0);
    if (costeUnit === 0 && l.articulo_id) {
      const llegada = costeLlegada.get(l.articulo_id);
      if (llegada && llegada.qty > 0) costeUnit = llegada.sum / llegada.qty;
      else costeUnit = Number((a?.coste_unitario as number | undefined) ?? 0);
    }
    const coste = sign * Number(l.cantidad ?? 0) * costeUnit;
    importeVendido += importe;
    costeVenta += coste;

    const fam = (a?.familia_id && familiasMap.get(a.familia_id)) ?? 'Sin familia';
    pushMap(porFamiliaRaw, fam, importe, coste);

    const key = a?.id ?? l.factura_id;
    const aRaw = porArticuloRaw.get(key) ?? { nombre: a?.nombre ?? '—', unidades: 0, importe: 0, coste: 0 };
    aRaw.unidades += Number(l.cantidad ?? 0);
    aRaw.importe += importe;
    aRaw.coste += coste;
    porArticuloRaw.set(key, aRaw);
    porArticuloUnides.set(key, (porArticuloUnides.get(key) ?? 0) + Number(l.cantidad ?? 0));

    if (a) {
      const marca = (a.marca_id && marcasMap.get(a.marca_id)) ?? 'Sin marca';
      const marcaBlanca = Boolean(a.marca_blanca_cliente_id);
      const mRaw = porMarcaRaw.get(marca) ?? { marcaBlanca, importe: 0, coste: 0 };
      mRaw.importe += importe;
      mRaw.coste += coste;
      mRaw.marcaBlanca = mRaw.marcaBlanca || marcaBlanca;
      porMarcaRaw.set(marca, mRaw);
      const art = tarifaExport.get(a.id) ?? { nombre: a.nombre, unidades: 0, importe: 0, tarifa: Number(a.precio_tarifa ?? 0) };
      art.unidades += Number(l.cantidad ?? 0);
      art.importe += importe;
      tarifaExport.set(a.id, art);
    }

    if (f) {
      const com = f.comercial_id && comercialesMap.get(f.comercial_id);
      if (f.comercial_id) pushMap(porComercialRaw, com ?? '—', importe, coste);
      pushMap(porFacturaRaw, f.id, importe, coste);
      const mes = f.fecha.slice(0, 7);
      pushMap(porMesRaw, mes, importe, coste);
      if (c) {
        pushMap(porClienteRaw, c.nombre, importe, coste);
        const canal = c.canal_id && canalesMap.get(c.canal_id);
        if (c.canal_id) pushMap(porCanalRaw, canal ?? '—', importe, coste);
        const pais = c.pais_facturacion || 'Sin país';
        pushMap(porPaisRaw, pais, importe, coste);
      }
    }
  }

  const mapear = (m: Map<string, { importe: number; coste: number }>) =>
    [...m.entries()].map(([nombre, v]) => ({ nombre, importe: v.importe, margenPct: margenPct(v.importe, v.coste) }));
  const ordenar = (arr: { nombre: string; importe: number; margenPct: number }[]) => arr.sort((a, b) => b.importe - a.importe);

  const porFamilia = [...porFamiliaRaw.entries()]
    .map(([familia, v]) => ({ familia, importe: v.importe, coste: v.coste, margen: v.importe - v.coste, margenPct: margenPct(v.importe, v.coste) }))
    .sort((a, b) => b.importe - a.importe);
  const porArticulo = [...porArticuloRaw.entries()]
    .map(([, v]) => ({ articulo: v.nombre, unidades: v.unidades, importe: v.importe, margen: v.importe - v.coste, margenPct: margenPct(v.importe, v.coste), margenUnidad: v.unidades > 0 ? (v.importe - v.coste) / v.unidades : 0 }))
    .sort((a, b) => b.margen - a.margen)
    .slice(0, 10);
  const porComercial = ordenar(mapear(porComercialRaw));
  const porCanal = ordenar(mapear(porCanalRaw));
  const porPais = ordenar(mapear(porPaisRaw));
  const porCliente = ordenar(mapear(porClienteRaw)).slice(0, 10);
  const porMarca = [...porMarcaRaw.entries()]
    .map(([nombre, v]) => ({ nombre, importe: v.importe, margenPct: margenPct(v.importe, v.coste), marcaBlanca: v.marcaBlanca }))
    .sort((a, b) => b.importe - a.importe);

  const facturasPorTramo = TRAMOS_MARGEN.map((t) => {
    let facturasEnTramo = 0;
    let importeEnTramo = 0;
    for (const [id, v] of porFacturaRaw.entries()) {
      const pct = margenPct(v.importe, v.coste);
      if (pct >= t.min && pct < t.max) {
        facturasEnTramo += 1;
        importeEnTramo += v.importe;
      }
    }
    return { tramo: t.tramo, facturas: facturasEnTramo, importe: importeEnTramo };
  });

  let erosionSum = 0;
  let erosionImporte = 0;
  const erosionTarifa = [...tarifaExport.entries()]
    .map(([id, v]) => {
      const pvd = v.unidades > 0 ? v.importe / v.unidades : 0;
      const erosionPct = v.tarifa > 0 && pvd < v.tarifa ? (1 - pvd / v.tarifa) * 100 : 0;
      if (erosionPct > 0) {
        erosionSum += erosionPct * v.importe;
        erosionImporte += v.importe;
      }
      return { articulo: v.nombre, unidades: v.unidades, pvd, tarifa: v.tarifa, erosionPct };
    })
    .filter((e) => e.erosionPct > 0)
    .sort((a, b) => b.erosionPct - a.erosionPct)
    .slice(0, 5);
  const erosionMedia = erosionImporte > 0 ? erosionSum / erosionImporte : null;

  const unidades = [...porArticuloUnides.values()];
  const filasMatriz = [...porArticuloUnides.entries()].map(([id, u]) => ({
    margenPct: margenPct(porArticuloRaw.get(id)?.importe ?? 0, porArticuloRaw.get(id)?.coste ?? 0),
    unidades: u,
  }));
  const terciles = (() => {
    const s = [...unidades].sort((a, b) => a - b);
    return { baja: s[Math.floor(s.length / 3)] ?? 0, alta: s[Math.floor((s.length * 2) / 3)] ?? 0 };
  })();
  const matrices = new Map<string, { baja: number; media: number; alta: number }>();
  for (const f of filasMatriz) {
    const tramo = TRAMOS_MARGEN.find((t) => f.margenPct >= t.min && f.margenPct < t.max)?.tramo ?? '< 30 %';
    const clave = f.unidades <= terciles.baja ? 'baja' : f.unidades <= terciles.alta ? 'media' : 'alta';
    const celda = matrices.get(tramo) ?? { baja: 0, media: 0, alta: 0 };
    celda[clave] += 1;
    matrices.set(tramo, celda);
  }
  const matrizMargenRotacion = TRAMOS_MARGEN.map((t) => ({
    tramoMargen: t.tramo,
    ...(matrices.get(t.tramo) ?? { baja: 0, media: 0, alta: 0 }),
  }));

  const mensual = [...porMesRaw.entries()]
    .map(([mes, v]) => ({ mes, importe: v.importe, margenPct: margenPct(v.importe, v.coste) }))
    .sort((a, b) => (a.mes < b.mes ? -1 : 1));

  const ultimosLotes = ((lotesRes.data ?? []) as { lote_id: string; articulo: string; fecha_compra: string; coste_unitario_compra: number; coste_repartido_unitario: number; coste_completo_unitario: number }[])
    .slice(0, 8)
    .map((l) => ({
      lote: l.lote_id.slice(0, 8),
      articulo: l.articulo,
      fecha: l.fecha_compra,
      costeCompra: Number(l.coste_unitario_compra),
      costeRepartido: Number(l.coste_repartido_unitario),
      costeCompleto: Number(l.coste_completo_unitario),
    }));

  const margen = importeVendido - costeVenta;
  return {
    empresa,
    anio,
    sinAcceso: false,
    importeVendido,
    costeVenta,
    margen,
    margenPct: margenPct(importeVendido, costeVenta),
    porFamilia,
    porArticulo,
    porComercial,
    porMarca,
    porCanal,
    porPais,
    porCliente,
    facturasPorTramo,
    erosionTarifa,
    erosionMedia,
    matrizMargenRotacion,
    mensual,
    ultimosLotes,
  };
}