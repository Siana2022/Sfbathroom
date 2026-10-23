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
  porComercial: { nombre: string; importe: number; margenPct: number; secciones: { nombre: string; importe: number; margenPct: number }[] }[];
  porMarca: { nombre: string; importe: number; margenPct: number; marcaBlanca: boolean }[];
  porCanal: { nombre: string; importe: number; margenPct: number }[];
  porPais: { nombre: string; importe: number; margenPct: number }[];
  porCliente: { nombre: string; importe: number; margenPct: number }[];
  facturasPorTramo: { tramo: string; facturas: number; importe: number }[];
  erosionTarifa: { articulo: string; unidades: number; pvd: number; tarifa: number; erosionPct: number }[];
  erosionMedia: number | null;
  matrizMargenRotacion: { tramoMargen: string; baja: number; media: number; alta: number }[];
  mensual: { mes: string; unidades: number; bruto: number; descuento: number; neto: number; coste: number; margen: number; margenPct: number }[];
};

type FilaFactura = { id: string; cliente_id: string | null; comercial_id: string | null; fecha: string; tipo_documento: string; total: number };
type FilaLinea = { factura_id: string; articulo_id: string | null; cantidad: number; precio_unitario: number | null; base_imponible: number | null; coste_unitario: number | null };
type FilaArticulo = { id: string; nombre: string; familia: string | null; marca_id: string | null; marca_blanca_cliente_id: string | null; coste_unitario: number | null; precio_coste: number | null; precio_tarifa: number | null };
type FilaCliente = { id: string; nombre: string; canal_id: string | null; pais_facturacion: string | null };
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
    };
  }

  const [idsFiltrados, facturasRes, articulos, marcasRes, canalesRes, clientes, comercialesRes, costeLlegadaFilas] = await Promise.all([
    getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`),
    todasLasFilas<FilaFactura>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, comercial_id, fecha, tipo_documento, total')
        .eq('empresa_id', empresa.id)
        .in('tipo_documento', ['factura', 'abono', 'nota_cargo'])
        .gte('fecha', `${anio}-01-01`)
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    todasLasFilas<FilaArticulo>((desde) =>
      supabase
        .from('articulos')
        .select('id, nombre, familia, marca_id, marca_blanca_cliente_id, coste_unitario, precio_coste, precio_tarifa')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    supabase.from('marcas').select('id, nombre'),
    supabase.from('canales').select('id, nombre'),
    todasLasFilas<FilaCliente>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre, canal_id, pais_facturacion')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    supabase.from('comerciales').select('id, nombre'),
    todasLasFilas<{ articulo_id: string; coste_completo_unitario: number | null; cantidad: number | null }>((desde) =>
      supabase
        .from('v_coste_completo_por_lote')
        .select('articulo_id, coste_completo_unitario, cantidad')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
  ]);

  const facturas = filtrarPorIds(facturasRes, idsFiltrados);
  const ids = facturas.map((f) => f.id);

  const filasLineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, cantidad, precio_unitario, base_imponible, coste_unitario', ids);

  const articuloPorId = new Map<string, FilaArticulo>(articulos.map((a) => [a.id, a as FilaArticulo]));

  const marcasMap = new Map<string, string>();
  for (const m of (marcasRes.data ?? []) as FilaEtiqueta[]) marcasMap.set(m.id, m.nombre);
  const canalesMap = new Map<string, string>();
  for (const c of (canalesRes.data ?? []) as FilaEtiqueta[]) canalesMap.set(c.id, c.nombre);

  const clientesPorId = new Map<string, FilaCliente>();
  for (const c of clientes as FilaCliente[]) clientesPorId.set(c.id, c);
  const comercialesMap = new Map<string, string>();
  for (const c of (comercialesRes.data ?? []) as FilaEtiqueta[]) comercialesMap.set(c.id, c.nombre);

  const facturaPorId = new Map(facturas.map((f) => [f.id, f]));
  const costeLlegada = new Map<string, { sum: number; qty: number }>();
  for (const l of costeLlegadaFilas as { articulo_id: string; coste_completo_unitario: number | null; cantidad: number | null }[]) {
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
  const porMesRaw = new Map<string, { unidades: number; bruto: number; neto: number; coste: number }>();
  const porArticuloUnides = new Map<string, number>();
  const tarifaExport = new Map<string, { nombre: string; unidades: number; importe: number; tarifa: number }>();
  let importeVendido = 0;
  let costeVenta = 0;

  for (const l of filasLineas) {
    const a = l.articulo_id ? articuloPorId.get(l.articulo_id) : undefined;
    const f = facturaPorId.get(l.factura_id);
    const c = f?.cliente_id ? clientesPorId.get(f.cliente_id) : undefined;
    const importe = Number(l.base_imponible ?? 0);
    let costeUnit = Number(l.coste_unitario ?? 0);
    if (costeUnit === 0 && l.articulo_id) {
      const llegada = costeLlegada.get(l.articulo_id);
      if (llegada && llegada.qty > 0) costeUnit = llegada.sum / llegada.qty;
      else costeUnit = Number(a?.coste_unitario ?? a?.precio_coste ?? 0);
    }
    const coste = Number(l.cantidad ?? 0) * costeUnit;
    importeVendido += importe;
    costeVenta += coste;

    const fam = a?.familia ? String(a.familia).trim() : 'Sin familia';
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
      const mesRaw = porMesRaw.get(mes) ?? { unidades: 0, bruto: 0, neto: 0, coste: 0 };
      mesRaw.unidades += Number(l.cantidad ?? 0);
      mesRaw.bruto += Number(l.cantidad ?? 0) * Number(l.precio_unitario ?? 0);
      mesRaw.neto += importe;
      mesRaw.coste += coste;
      porMesRaw.set(mes, mesRaw);
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
  const sufijos = new Map<string, number>();
  for (const nombre of porComercialRaw.keys()) {
    const i = nombre.indexOf(' - ');
    if (i > 0) {
      const sufijo = nombre.slice(i + 3).trim();
      sufijos.set(sufijo, (sufijos.get(sufijo) ?? 0) + 1);
    }
  }
  const comercialAgrupado = new Map<string, { importe: number; coste: number; secciones: Map<string, { importe: number; coste: number }> }>();
  for (const [nombre, v] of porComercialRaw.entries()) {
    const i = nombre.indexOf(' - ');
    let base = nombre;
    let seccion: string | null = null;
    if (i > 0) {
      const sufijo = nombre.slice(i + 3).trim();
      if ((sufijos.get(sufijo) ?? 0) > 1) {
        base = sufijo;
        seccion = nombre.slice(0, i).trim();
      }
    }
    const agg = comercialAgrupado.get(base) ?? { importe: 0, coste: 0, secciones: new Map() };
    agg.importe += v.importe;
    agg.coste += v.coste;
    if (seccion) {
      const sec = agg.secciones.get(seccion) ?? { importe: 0, coste: 0 };
      sec.importe += v.importe;
      sec.coste += v.coste;
      agg.secciones.set(seccion, sec);
    }
    comercialAgrupado.set(base, agg);
  }
  const porComercial = [...comercialAgrupado.entries()]
    .map(([nombre, v]) => ({
      nombre,
      importe: v.importe,
      margenPct: margenPct(v.importe, v.coste),
      secciones: [...v.secciones.entries()]
        .map(([seccion, sv]) => ({ nombre: seccion, importe: sv.importe, margenPct: margenPct(sv.importe, sv.coste) }))
        .sort((a, b) => b.importe - a.importe),
    }))
    .sort((a, b) => b.importe - a.importe);
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
    .map(([mes, v]) => ({
      mes,
      unidades: v.unidades,
      bruto: v.bruto,
      descuento: v.bruto - v.neto,
      neto: v.neto,
      coste: v.coste,
      margen: v.neto - v.coste,
      margenPct: margenPct(v.neto, v.coste),
    }))
    .sort((a, b) => (a.mes < b.mes ? -1 : 1));

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
  };
}
