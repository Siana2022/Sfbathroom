import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getRol, puedeVerMargenes } from '@/lib/datos/role';
import { filtrarPorIds, getFacturaIdsFiltradas, hayFiltros, type Filtros } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { ventasAnioRpc } from '@/lib/datos/ventas';

export type MargenCliente = {
  nombre: string;
  importe: number;
  coste: number;
  margen: number;
  margenPct: number;
};

export type MargenFamilia = {
  familia: string;
  importe: number;
  coste: number;
  margen: number;
  margenPct: number;
  clientes: MargenCliente[];
};

export type MargenComercial = {
  nombre: string;
  importe: number;
  coste: number;
  margen: number;
  margenPct: number;
  secciones: { nombre: string; importe: number; coste: number; margen: number; margenPct: number }[];
};

export type ErosionFactura = {
  factura: string;
  cliente: string;
  importe: number;
  importeTarifa: number;
  descuentoPct: number;
  margenPct: number;
};

export type MargenData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  sinAcceso: boolean;
  importeVendido: number;
  costeVenta: number;
  margen: number;
  margenPct: number;
  porFamilia: MargenFamilia[];
  porArticulo: { articulo: string; unidades: number; importe: number; coste: number; margen: number; margenPct: number; margenUnidad: number }[];
  porComercial: MargenComercial[];
  porMarca: { nombre: string; importe: number; coste: number; margen: number; margenPct: number; marcaBlanca: boolean }[];
  porCanal: { nombre: string; importe: number; coste: number; margen: number; margenPct: number }[];
  porPais: MargenCliente[];
  porCliente: MargenCliente[];
  facturasPorTramo: { tramo: string; facturas: number; importe: number; margen: number }[];
  erosionUmbral: number;
  erosionMedia: number | null;
  erosionFacturas: ErosionFactura[];
  mensual: { mes: string; unidades: number; bruto: number; descuento: number; neto: number; coste: number; margen: number; margenPct: number }[];
};

type FilaFactura = { id: string; cliente_id: string | null; comercial_id: string | null; fecha: string; tipo_documento: string; total: number; numero_erp?: string | null };
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

const TOKENS_GRUPO_COMERCIAL = ['STARBATH', 'BIGMAT'];

function margenPct(importe: number, coste: number): number {
  return importe > 0 ? ((importe - coste) / importe) * 100 : 0;
}

function pushMap(m: Map<string, { importe: number; coste: number }>, clave: string, importe: number, coste: number) {
  const v = m.get(clave) ?? { importe: 0, coste: 0 };
  v.importe += importe;
  v.coste += coste;
  m.set(clave, v);
}

function aCliente(nombre: string, v: { importe: number; coste: number }): MargenCliente {
  return { nombre, importe: v.importe, coste: v.coste, margen: v.importe - v.coste, margenPct: margenPct(v.importe, v.coste) };
}

/** Agrupa STARBATH/BIGMAT bajo una cabecera y deja el resto del nombre como sección. */
function agruparComercial(nombre: string, sufijos: Map<string, number>): { base: string; seccion: string | null } {
  const up = nombre.toUpperCase();
  for (const token of TOKENS_GRUPO_COMERCIAL) {
    if (up.includes(token)) {
      const resto = nombre
        .replace(new RegExp(token, 'ig'), '')
        .replace(/^[\s\-–—|/]+|[\s\-–—|/]+$/g, '')
        .trim();
      const base = token.charAt(0) + token.slice(1).toLowerCase();
      return { base, seccion: resto === '' ? null : resto };
    }
  }
  const i = nombre.indexOf(' - ');
  if (i > 0) {
    const sufijo = nombre.slice(i + 3).trim();
    if ((sufijos.get(sufijo) ?? 0) > 1) return { base: sufijo, seccion: nombre.slice(0, i).trim() };
  }
  return { base: nombre, seccion: null };
}

export async function getMargen(
  codigoEmpresa: string,
  anio: number,
  filtros?: Filtros,
  erosionMin = 15,
): Promise<MargenData> {
  const supabase = createClient();
  const [empresa, rol] = await Promise.all([getEmpresaPorCodigo(codigoEmpresa), getRol()]);
  const vacio: MargenData = {
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
    erosionUmbral: erosionMin,
    erosionMedia: null,
    erosionFacturas: [],
    mensual: [],
  };
  if (!puedeVerMargenes(rol)) return vacio;

  // Camino rápido sin filtros: facturas + líneas en una sola llamada (RPC ventas_anio).
  const sinFiltros = !filtros || !hayFiltros(filtros);

  const [ventas, articulos, marcasRes, canalesRes, clientes, comercialesRes, costeLlegadaFilas] = await Promise.all([
    sinFiltros ? ventasAnioRpc(supabase, codigoEmpresa, anio) : Promise.resolve(null),
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

  let facturas: FilaFactura[];
  let filasLineas: FilaLinea[];
  if (ventas) {
    facturas = ventas.facturas as unknown as FilaFactura[];
    filasLineas = ventas.lineas as unknown as FilaLinea[];
  } else {
    const [idsFiltrados, facturasRes] = await Promise.all([
      getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`),
      todasLasFilas<FilaFactura>((desde) =>
        supabase
          .from('facturas')
          .select('id, numero_erp, cliente_id, comercial_id, fecha, tipo_documento, total')
          .eq('empresa_id', empresa.id)
          .in('tipo_documento', ['factura', 'abono', 'nota_cargo'])
          .gte('fecha', `${anio}-01-01`)
          .lte('fecha', `${anio}-12-31`)
          .range(desde, desde + TAMANO_PAGINA - 1)
      ),
    ]);
    facturas = filtrarPorIds(facturasRes, idsFiltrados);
    filasLineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, cantidad, precio_unitario, base_imponible, coste_unitario', facturas.map((f) => f.id));
  }

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
  const familiaClientesRaw = new Map<string, Map<string, { importe: number; coste: number }>>();
  const porArticuloRaw = new Map<string, { nombre: string; unidades: number; importe: number; coste: number }>();
  const porComercialRaw = new Map<string, { importe: number; coste: number }>();
  const porMarcaRaw = new Map<string, { marcaBlanca: boolean; importe: number; coste: number }>();
  const porCanalRaw = new Map<string, { importe: number; coste: number }>();
  const porPaisRaw = new Map<string, { importe: number; coste: number }>();
  const porClienteRaw = new Map<string, { importe: number; coste: number }>();
  const porFacturaRaw = new Map<string, { importe: number; coste: number; tarifa: number; cliente: string; numero: string | null }>();
  const porMesRaw = new Map<string, { unidades: number; bruto: number; neto: number; coste: number }>();
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

    const clienteNombre = c?.nombre ?? 'Sin cliente';
    const famClientes = familiaClientesRaw.get(fam) ?? new Map<string, { importe: number; coste: number }>();
    pushMap(famClientes, clienteNombre, importe, coste);
    familiaClientesRaw.set(fam, famClientes);

    const key = a?.id ?? l.factura_id;
    const aRaw = porArticuloRaw.get(key) ?? { nombre: a?.nombre ?? '—', unidades: 0, importe: 0, coste: 0 };
    aRaw.unidades += Number(l.cantidad ?? 0);
    aRaw.importe += importe;
    aRaw.coste += coste;
    porArticuloRaw.set(key, aRaw);

    if (a) {
      const marca = (a.marca_id && marcasMap.get(a.marca_id)) ?? 'Sin marca';
      const mRaw = porMarcaRaw.get(marca) ?? { marcaBlanca: false, importe: 0, coste: 0 };
      mRaw.importe += importe;
      mRaw.coste += coste;
      mRaw.marcaBlanca = mRaw.marcaBlanca || Boolean(a.marca_blanca_cliente_id);
      porMarcaRaw.set(marca, mRaw);
    }

    if (f) {
      const com = f.comercial_id && comercialesMap.get(f.comercial_id);
      if (f.comercial_id) pushMap(porComercialRaw, com ?? '—', importe, coste);
      const facRaw = porFacturaRaw.get(f.id) ?? { importe: 0, coste: 0, tarifa: 0, cliente: clienteNombre, numero: f.numero_erp ?? null };
      facRaw.importe += importe;
      facRaw.coste += coste;
      if (a && a.precio_tarifa) facRaw.tarifa += Number(l.cantidad ?? 0) * Number(a.precio_tarifa);
      porFacturaRaw.set(f.id, facRaw);

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
        pushMap(porPaisRaw, c.pais_facturacion || 'Sin país', importe, coste);
      }
    }
  }

  const mapear = (m: Map<string, { importe: number; coste: number }>) => [...m.entries()].map(([nombre, v]) => aCliente(nombre, v));
  const ordenar = (arr: MargenCliente[]) => arr.sort((a, b) => b.importe - a.importe);

  const porFamilia: MargenFamilia[] = [...porFamiliaRaw.entries()]
    .map(([familia, v]) => ({
      familia,
      importe: v.importe,
      coste: v.coste,
      margen: v.importe - v.coste,
      margenPct: margenPct(v.importe, v.coste),
      clientes: ordenar(mapear(familiaClientesRaw.get(familia) ?? new Map())).slice(0, 10),
    }))
    .sort((a, b) => b.importe - a.importe);

  const porArticulo = [...porArticuloRaw.entries()]
    .map(([, v]) => ({
      articulo: v.nombre,
      unidades: v.unidades,
      importe: v.importe,
      coste: v.coste,
      margen: v.importe - v.coste,
      margenPct: margenPct(v.importe, v.coste),
      margenUnidad: v.unidades > 0 ? (v.importe - v.coste) / v.unidades : 0,
    }))
    .sort((a, b) => b.margen - a.margen)
    .slice(0, 20);

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
    const { base, seccion } = agruparComercial(nombre, sufijos);
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
  const porComercial: MargenComercial[] = [...comercialAgrupado.entries()]
    .map(([nombre, v]) => ({
      nombre,
      importe: v.importe,
      coste: v.coste,
      margen: v.importe - v.coste,
      margenPct: margenPct(v.importe, v.coste),
      secciones: [...v.secciones.entries()]
        .map(([seccion, sv]) => ({
          nombre: seccion,
          importe: sv.importe,
          coste: sv.coste,
          margen: sv.importe - sv.coste,
          margenPct: margenPct(sv.importe, sv.coste),
        }))
        .sort((a, b) => b.importe - a.importe),
    }))
    .sort((a, b) => b.importe - a.importe);

  const porCanal = ordenar(mapear(porCanalRaw));
  const porPais = ordenar(mapear(porPaisRaw));
  const porCliente = ordenar(mapear(porClienteRaw)).slice(0, 20);

  const porMarca = [...porMarcaRaw.entries()]
    .map(([nombre, v]) => ({
      nombre,
      importe: v.importe,
      coste: v.coste,
      margen: v.importe - v.coste,
      margenPct: margenPct(v.importe, v.coste),
      marcaBlanca: v.marcaBlanca,
    }))
    .sort((a, b) => b.importe - a.importe);

  const facturasPorTramo = TRAMOS_MARGEN.map((t) => {
    let facturasEnTramo = 0;
    let importeEnTramo = 0;
    let margenEnTramo = 0;
    for (const v of porFacturaRaw.values()) {
      const pct = margenPct(v.importe, v.coste);
      if (pct >= t.min && pct < t.max) {
        facturasEnTramo += 1;
        importeEnTramo += v.importe;
        margenEnTramo += v.importe - v.coste;
      }
    }
    return { tramo: t.tramo, facturas: facturasEnTramo, importe: importeEnTramo, margen: margenEnTramo };
  });

  // Erosión: facturas cuyo precio real queda por debajo de tarifa más de `erosionMin` %.
  let erosionSum = 0;
  let erosionImporte = 0;
  for (const v of porFacturaRaw.values()) {
    if (v.tarifa > 0 && v.importe > 0 && v.importe < v.tarifa) {
      const pct = (1 - v.importe / v.tarifa) * 100;
      erosionSum += pct * v.importe;
      erosionImporte += v.importe;
    }
  }
  const erosionMedia = erosionImporte > 0 ? erosionSum / erosionImporte : null;

  const candidatas = [...porFacturaRaw.entries()]
    .filter(([, v]) => v.tarifa > 0 && v.importe > 0)
    .map(([id, v]) => ({
      id,
      numero: v.numero,
      cliente: v.cliente,
      importe: v.importe,
      importeTarifa: v.tarifa,
      descuentoPct: (1 - v.importe / v.tarifa) * 100,
      margenPct: margenPct(v.importe, v.coste),
    }))
    .filter((f) => f.descuentoPct >= erosionMin)
    .sort((a, b) => b.descuentoPct - a.descuentoPct)
    .slice(0, 100);

  // Número de factura: la RPC de ventas no lo trae, se pide solo para las candidatas.
  const sinNumero = candidatas.filter((c) => !c.numero).map((c) => c.id);
  if (sinNumero.length > 0) {
    const numeros = new Map<string, string>();
    for (let i = 0; i < sinNumero.length; i += 50) {
      const lote = sinNumero.slice(i, i + 50);
      const { data } = await supabase.from('facturas').select('id, numero_erp').in('id', lote);
      for (const f of (data ?? []) as { id: string; numero_erp: string | null }[]) {
        if (f.numero_erp) numeros.set(f.id, f.numero_erp);
      }
    }
    for (const c of candidatas) if (!c.numero) c.numero = numeros.get(c.id) ?? null;
  }

  const erosionFacturas: ErosionFactura[] = candidatas.map((c) => ({
    factura: c.numero ?? c.id.slice(0, 8),
    cliente: c.cliente,
    importe: c.importe,
    importeTarifa: c.importeTarifa,
    descuentoPct: c.descuentoPct,
    margenPct: c.margenPct,
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
    erosionUmbral: erosionMin,
    erosionMedia,
    erosionFacturas,
    mensual,
  };
}
