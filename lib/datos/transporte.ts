import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { enLotes, todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';

export type TransporteCalculado = {
  anio: number;
  total: number;
  flete: number;
  aduana: number;
  seguro: number;
  transporteInterior: number;
  compras: number;
  pesoSobreImporte: number;
};

export async function getCosteTransporte(codigoEmpresa: string, anio: number): Promise<TransporteCalculado> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data, error } = await supabase
    .from('v_coste_transporte_anual')
    .select('anio, categoria, total_base, total_importe')
    .eq('empresa_id', empresa.id)
    .eq('anio', anio);

  let flete = 0;
  let aduana = 0;
  let transporteInterior = 0;

  if (!error && data) {
    for (const r of data as any[]) {
      const importe = Number(r.total_importe ?? r.total_base ?? 0);
      if (r.categoria === 'fletes') flete += importe;
      else if (r.categoria === 'aduanas') aduana += importe;
      else if (r.categoria === 'transporte_interior') transporteInterior += importe;
    }
  }

  const total = flete + aduana + transporteInterior;

  return {
    anio,
    total,
    flete,
    aduana,
    seguro: 0, // agrupado o cero si no se separa
    transporteInterior,
    compras: (data ?? []).length,
    pesoSobreImporte: 0,
  };
}

export type TransporteClienteMes = { cliente: string; meses: number[]; total: number };

export type TransporteFacturadoCliente = {
  anio: number;
  interior: { total: number; filas: TransporteClienteMes[] };
  flete: { total: number; filas: TransporteClienteMes[] };
  aduana: { total: number; filas: TransporteClienteMes[] };
};

const RE_ADUANA = /ADUAN|DUA|AEAT/i;
const RE_FLETE = /FLETE|MARITIM|CONSIGNAC|DSV|DISBROQUER|INTERNAC/i;

export async function getTransporteFacturadoPorCliente(
  codigoEmpresa: string,
  anio: number,
): Promise<TransporteFacturadoCliente> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const articulos = await todasLasFilas<{ id: string; codigo_erp: string; nombre: string; familia: string | null }>((desde) =>
    supabase
      .from('articulos')
      .select('id, codigo_erp, nombre, familia')
      .eq('empresa_id', empresa.id)
      .range(desde, desde + TAMANO_PAGINA - 1),
  );

  const vacio = (): TransporteFacturadoCliente => ({
    anio,
    interior: { total: 0, filas: [] },
    flete: { total: 0, filas: [] },
    aduana: { total: 0, filas: [] },
  });
  if (articulos.length === 0) return vacio();

  const categoriaPorArticulo = new Map<string, 'interior' | 'flete' | 'aduana'>();
  for (const a of articulos) {
    const codigo = (a.codigo_erp ?? '').toUpperCase();
    const nombre = a.nombre ?? '';
    const texto = `${codigo} ${nombre}`;
    const esTransporte = codigo.startsWith('ZZ') && /TRANSP|ADUAN|FLETE|DUA/.test(texto.toUpperCase());
    if (!esTransporte) continue;
    const categoria = RE_ADUANA.test(texto) ? 'aduana' : RE_FLETE.test(texto) ? 'flete' : 'interior';
    categoriaPorArticulo.set(a.id, categoria);
  }

  const [facturas, clientes] = await Promise.all([
    todasLasFilas<{ id: string; cliente_id: string | null; fecha: string }>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, fecha')
        .eq('empresa_id', empresa.id)
        .gte('fecha', `${anio}-01-01`)
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ id: string; nombre: string }>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
  ]);

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  const facturaInfo = new Map<string, { cliente: string; mes: number }>();
  for (const f of facturas) {
    facturaInfo.set(f.id, {
      cliente: (f.cliente_id && nombreCliente.get(f.cliente_id)) || 'Sin cliente',
      mes: Number(f.fecha.slice(5, 7)),
    });
  }

  const lineas = await enLotes<{ factura_id: string; articulo_id: string | null; importe: number }>(
    (lote, desde) =>
      supabase
        .from('factura_lineas')
        .select('factura_id, articulo_id, importe')
        .in('factura_id', lote)
        .range(desde, desde + TAMANO_PAGINA - 1),
    facturas.map((f) => f.id),
  );

  const acumulado: Record<'interior' | 'flete' | 'aduana', Map<string, number[]>> = {
    interior: new Map(),
    flete: new Map(),
    aduana: new Map(),
  };

  for (const l of lineas) {
    if (!l.articulo_id) continue;
    const categoria = categoriaPorArticulo.get(l.articulo_id);
    if (!categoria) continue;
    const info = facturaInfo.get(l.factura_id);
    if (!info || info.mes < 1 || info.mes > 12) continue;

    const meses = acumulado[categoria].get(info.cliente) ?? new Array(12).fill(0);
    meses[info.mes - 1] += Number(l.importe ?? 0);
    acumulado[categoria].set(info.cliente, meses);
  }

  const construir = (mapa: Map<string, number[]>) => {
    const filas = [...mapa.entries()]
      .map(([cliente, meses]) => ({
        cliente,
        meses,
        total: meses.reduce((s, v) => s + v, 0),
      }))
      .filter((f) => Math.abs(f.total) > 0.005)
      .sort((a, b) => b.total - a.total);
    return { total: filas.reduce((s, f) => s + f.total, 0), filas };
  };

  return {
    anio,
    interior: construir(acumulado.interior),
    flete: construir(acumulado.flete),
    aduana: construir(acumulado.aduana),
  };
}

// ─── Rentabilidad de transporte terrestre (interior) por cliente ───
// Usa las líneas ZZ TRANSP interiores: facturado = importe de la línea (lo que se cobra),
// coste = coste_unitario × cantidad (lo que cuesta, viene manual en A3ERP). margen = facturado − coste.
export type RentabilidadTransporteFila = {
  cliente: string;
  facturaTransporte: boolean; // true si se cobra transporte (facturado > 0) en el periodo
  facturadoMeses: number[]; // 12
  costeMeses: number[]; // 12
  facturado: number;
  coste: number;
  margen: number;
  margenPct: number | null;
  facturacion: number; // facturación neta total del cliente (todas las líneas) en el año
  facturacionMeses: number[]; // 12 · facturación neta del cliente por mes
  pctSobreFacturacion: number | null; // margen de transporte / facturación × 100
};

export type RentabilidadTransporte = {
  anio: number;
  filas: RentabilidadTransporteFila[];
  totales: {
    facturado: number;
    coste: number;
    margen: number;
    margenPct: number | null;
    facturacionEmpresa: number; // facturación neta total de la empresa en el año
    pctSobreFacturacion: number | null; // margen transporte total / facturación empresa × 100
  };
};

export async function getRentabilidadTransporteCliente(
  codigoEmpresa: string,
  anio: number,
): Promise<RentabilidadTransporte> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const vacio = (): RentabilidadTransporte => ({
    anio,
    filas: [],
    totales: { facturado: 0, coste: 0, margen: 0, margenPct: null, facturacionEmpresa: 0, pctSobreFacturacion: null },
  });

  const articulos = await todasLasFilas<{ id: string; codigo_erp: string; nombre: string }>((desde) =>
    supabase
      .from('articulos')
      .select('id, codigo_erp, nombre')
      .eq('empresa_id', empresa.id)
      .range(desde, desde + TAMANO_PAGINA - 1),
  );
  if (articulos.length === 0) return vacio();

  // Solo artículos de transporte terrestre (interior): ZZ ... que no sean aduana ni flete.
  const esInterior = new Set<string>();
  for (const a of articulos) {
    const codigo = (a.codigo_erp ?? '').toUpperCase();
    const texto = `${codigo} ${a.nombre ?? ''}`.toUpperCase();
    const esTransporte = codigo.startsWith('ZZ') && /TRANSP|ADUAN|FLETE|DUA/.test(texto);
    if (!esTransporte) continue;
    if (RE_ADUANA.test(texto) || RE_FLETE.test(texto)) continue;
    esInterior.add(a.id);
  }
  if (esInterior.size === 0) return vacio();

  const [facturas, clientes] = await Promise.all([
    todasLasFilas<{ id: string; cliente_id: string | null; fecha: string; base_imponible: number | null }>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, fecha, base_imponible')
        .eq('empresa_id', empresa.id)
        .gte('fecha', `${anio}-01-01`)
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ id: string; nombre: string }>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
  ]);

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  const facturaInfo = new Map<string, { cliente: string; mes: number }>();
  // Facturación neta total (cabecera, todas las líneas) por cliente, por mes y de la empresa.
  const facturacionPorCliente = new Map<string, number>();
  const facturacionMesesPorCliente = new Map<string, number[]>();
  let facturacionEmpresa = 0;
  for (const f of facturas) {
    const mes = Number(f.fecha.slice(5, 7));
    const cliente = (f.cliente_id && nombreCliente.get(f.cliente_id)) || 'Sin cliente';
    facturaInfo.set(f.id, { cliente, mes });
    const base = Number(f.base_imponible ?? 0);
    facturacionPorCliente.set(cliente, (facturacionPorCliente.get(cliente) ?? 0) + base);
    facturacionEmpresa += base;
    if (mes >= 1 && mes <= 12) {
      const mm = facturacionMesesPorCliente.get(cliente) ?? new Array(12).fill(0);
      mm[mes - 1] += base;
      facturacionMesesPorCliente.set(cliente, mm);
    }
  }

  const lineas = await enLotes<{ factura_id: string; articulo_id: string | null; importe: number; cantidad: number; coste_unitario: number | null }>(
    (lote, desde) =>
      supabase
        .from('factura_lineas')
        .select('factura_id, articulo_id, importe, cantidad, coste_unitario')
        .in('factura_id', lote)
        .range(desde, desde + TAMANO_PAGINA - 1),
    facturas.map((f) => f.id),
  );

  const fact = new Map<string, number[]>();
  const cost = new Map<string, number[]>();
  for (const l of lineas) {
    if (!l.articulo_id || !esInterior.has(l.articulo_id)) continue;
    const info = facturaInfo.get(l.factura_id);
    if (!info || info.mes < 1 || info.mes > 12) continue;
    const mf = fact.get(info.cliente) ?? new Array(12).fill(0);
    const mc = cost.get(info.cliente) ?? new Array(12).fill(0);
    mf[info.mes - 1] += Number(l.importe ?? 0);
    mc[info.mes - 1] += Number(l.cantidad ?? 0) * Number(l.coste_unitario ?? 0);
    fact.set(info.cliente, mf);
    cost.set(info.cliente, mc);
  }

  const clientesTodos = new Set([...fact.keys(), ...cost.keys()]);
  const filas: RentabilidadTransporteFila[] = [...clientesTodos]
    .map((cliente) => {
      const facturadoMeses = fact.get(cliente) ?? new Array(12).fill(0);
      const costeMeses = cost.get(cliente) ?? new Array(12).fill(0);
      const facturado = facturadoMeses.reduce((s, v) => s + v, 0);
      const coste = costeMeses.reduce((s, v) => s + v, 0);
      const margen = facturado - coste;
      const facturacion = facturacionPorCliente.get(cliente) ?? 0;
      return {
        cliente,
        facturaTransporte: facturado > 0.005,
        facturadoMeses,
        costeMeses,
        facturado,
        coste,
        margen,
        margenPct: facturado > 0.005 ? (margen / facturado) * 100 : null,
        facturacion,
        facturacionMeses: facturacionMesesPorCliente.get(cliente) ?? new Array(12).fill(0),
        pctSobreFacturacion: Math.abs(facturacion) > 0.005 ? (margen / facturacion) * 100 : null,
      };
    })
    .filter((f) => Math.abs(f.facturado) > 0.005 || Math.abs(f.coste) > 0.005)
    .sort((a, b) => a.margen - b.margen); // peores (más negativos) primero

  const tFacturado = filas.reduce((s, f) => s + f.facturado, 0);
  const tCoste = filas.reduce((s, f) => s + f.coste, 0);
  const tMargen = tFacturado - tCoste;

  return {
    anio,
    filas,
    totales: {
      facturado: tFacturado,
      coste: tCoste,
      margen: tMargen,
      margenPct: tFacturado > 0.005 ? (tMargen / tFacturado) * 100 : null,
      facturacionEmpresa,
      pctSobreFacturacion: facturacionEmpresa > 0.005 ? (tMargen / facturacionEmpresa) * 100 : null,
    },
  };
}

export type TransporteProveedorMes = { proveedor: string; meses: number[]; total: number };

export type CosteTransportePorProveedor = {
  anio: number;
  interior: { total: number; filas: TransporteProveedorMes[] };
  flete: { total: number; filas: TransporteProveedorMes[] };
  aduana: { total: number; filas: TransporteProveedorMes[] };
};

export async function getCosteTransportePorProveedor(
  codigoEmpresa: string,
  anio: number,
): Promise<CosteTransportePorProveedor> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const gastos = await todasLasFilas<{
    fecha: string;
    proveedor_nombre: string | null;
    proveedor_codigo: string;
    categoria: string;
    base_imponible: number | null;
    total: number | null;
  }>((desde) =>
    supabase
      .from('gastos_logistica')
      .select('fecha, proveedor_nombre, proveedor_codigo, categoria, base_imponible, total')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`)
      .order('fecha')
      .range(desde, desde + TAMANO_PAGINA - 1),
  );

  const acumulado: Record<'interior' | 'flete' | 'aduana', Map<string, number[]>> = {
    interior: new Map(),
    flete: new Map(),
    aduana: new Map(),
  };

  for (const g of gastos) {
    const categoria =
      g.categoria === 'fletes' ? 'flete' : g.categoria === 'aduanas' ? 'aduana' : 'interior';
    const mes = Number(g.fecha.slice(5, 7));
    if (mes < 1 || mes > 12) continue;
    const nombre = (g.proveedor_nombre || g.proveedor_codigo || 'Sin proveedor').trim();
    const meses = acumulado[categoria].get(nombre) ?? new Array(12).fill(0);
    meses[mes - 1] += Number(g.total ?? g.base_imponible ?? 0);
    acumulado[categoria].set(nombre, meses);
  }

  const construir = (mapa: Map<string, number[]>) => {
    const filas = [...mapa.entries()]
      .map(([proveedor, meses]) => ({ proveedor, meses, total: meses.reduce((s, v) => s + v, 0) }))
      .filter((f) => Math.abs(f.total) > 0.005)
      .sort((a, b) => b.total - a.total);
    return { total: filas.reduce((s, f) => s + f.total, 0), filas };
  };

  return {
    anio,
    interior: construir(acumulado.interior),
    flete: construir(acumulado.flete),
    aduana: construir(acumulado.aduana),
  };
}
