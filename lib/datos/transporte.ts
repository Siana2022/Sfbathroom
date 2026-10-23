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
