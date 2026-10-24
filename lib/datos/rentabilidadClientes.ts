import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { enLotes, todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { getArticuloIdsFiltrados, type Filtros } from '@/lib/datos/filtros';
import { getCosteTransportePorProveedor } from '@/lib/datos/transporte';

const RE_ABONO = /(ABON|DEVOL)/i;

type FilaFactura = { id: string; cliente_id: string | null; fecha: string; tipo_documento: string; numero_erp: string | null };
type FilaLinea = { factura_id: string; articulo_id: string | null; importe: number; cantidad: number; coste_unitario: number | null };
type FilaCliente = { id: string; nombre: string };

export type FilaRentabilidadCliente = {
  cliente_id: string;
  cliente: string;
  facturacionNeta: number;
  unidades: number;
  costeMaterial: number;
  costeTransporteInterior: number;
  margenBruto: number;
  margenBrutoPct: number | null;
};

export type RentabilidadClientesResumen = {
  empresa: { codigo: string; nombre: string };
  anio: number;
  filas: FilaRentabilidadCliente[];
  totales: {
    facturacionNeta: number;
    unidades: number;
    costeMaterial: number;
    costeTransporteInterior: number;
    margenBruto: number;
    margenBrutoPct: number | null;
  };
};

function esNeta(tipo: string): boolean {
  const t = (tipo ?? '').toLowerCase();
  if (RE_ABONO.test(t)) return false;
  if (t.includes('factura')) return true;
  if (t.includes('cargo')) return true;
  if (t.includes('abono')) return false;
  return true;
}

function signo(tipo: string, importe: number): number {
  const t = (tipo ?? '').toLowerCase();
  if (RE_ABONO.test(t) || t.includes('abono')) return -Math.abs(importe);
  return importe;
}

export async function getRentabilidadClientes(
  codigoEmpresa: string,
  anio: number,
  filtros?: Filtros,
): Promise<RentabilidadClientesResumen> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const idsArticulo = await getArticuloIdsFiltrados(supabase, empresa.id, filtros ?? {});

  const [facturasRaw, clientesRaw] = await Promise.all([
    todasLasFilas<FilaFactura>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, fecha, tipo_documento, numero_erp')
        .eq('empresa_id', empresa.id)
        .gte('fecha', `${anio}-01-01`)
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<FilaCliente>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre')
        .eq('empresa_id', empresa.id)
        .order('nombre')
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
  ]);

  let facturas = facturasRaw;
  if (filtros?.cliente) {
    facturas = facturas.filter((f) => f.cliente_id === filtros.cliente);
  }

  const clienteNombre = new Map(clientesRaw.map((c) => [c.id, c.nombre]));
  const facturaInfo = new Map<string, FilaFactura>();
  for (const f of facturas) {
    if (f.cliente_id) facturaInfo.set(f.id, f);
  }

  const lineas = await enLotes<FilaLinea>(
    (lote, desde) =>
      supabase
        .from('factura_lineas')
        .select('factura_id, articulo_id, importe, cantidad, coste_unitario')
        .in('factura_id', lote)
        .range(desde, desde + TAMANO_PAGINA - 1),
    facturas.map((f) => f.id),
  );

  const [costes, costeProv] = await Promise.all([
    todasLasFilas<{ articulo_id: string; coste_completo_unitario: number | null }>((desde) =>
      supabase
        .from('v_coste_completo_por_lote')
        .select('articulo_id, coste_completo_unitario')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    getCosteTransportePorProveedor(codigoEmpresa, anio),
  ]);

  const costeCompleto = new Map<string, number>();
  for (const c of costes) {
    const v = Number(c.coste_completo_unitario);
    if (!Number.isNaN(v) && v > 0 && !costeCompleto.has(c.articulo_id)) {
      costeCompleto.set(c.articulo_id, v);
    }
  }

  const importePorCliente = new Map<string, number>();
  const unidadesPorCliente = new Map<string, number>();
  const costeMatPorCliente = new Map<string, number>();

  for (const l of lineas) {
    const info = facturaInfo.get(l.factura_id);
    if (!info?.cliente_id) continue;
    if (idsArticulo && l.articulo_id && !idsArticulo.has(l.articulo_id)) continue;

    const imp = Number(l.importe ?? 0);
    const cant = Number(l.cantidad ?? 0);
    const neto = esNeta(info.tipo_documento) ? signo(info.tipo_documento, imp) : 0;
    const unidades = esNeta(info.tipo_documento) ? signo(info.tipo_documento, cant) : 0;

    importePorCliente.set(info.cliente_id, (importePorCliente.get(info.cliente_id) ?? 0) + neto);
    unidadesPorCliente.set(info.cliente_id, (unidadesPorCliente.get(info.cliente_id) ?? 0) + unidades);

    if (l.articulo_id) {
      const cc = costeCompleto.get(l.articulo_id);
      const cu = cc ?? Number(l.coste_unitario ?? 0);
      if (cu > 0) {
        const cm = esNeta(info.tipo_documento) ? signo(info.tipo_documento, cu * cant) : 0;
        costeMatPorCliente.set(info.cliente_id, (costeMatPorCliente.get(info.cliente_id) ?? 0) + cm);
      }
    }
  }

  const totalFacturado = [...importePorCliente.values()].reduce((s, v) => s + v, 0);
  const costeTransInteriorTotal = Number(costeProv.interior.total ?? 0);
  const reparto = totalFacturado > 0 ? costeTransInteriorTotal / totalFacturado : 0;

  const filas: FilaRentabilidadCliente[] = [];
  for (const [cliente_id, facturacionNeta] of importePorCliente.entries()) {
    if (Math.abs(facturacionNeta) < 0.01) continue;
    const costeMaterial = costeMatPorCliente.get(cliente_id) ?? 0;
    const costeTransporteInterior = facturacionNeta > 0 ? facturacionNeta * reparto : 0;
    const margenBruto = facturacionNeta - costeMaterial - costeTransporteInterior;
    const margenBrutoPct = facturacionNeta !== 0 ? (margenBruto / facturacionNeta) * 100 : null;
    filas.push({
      cliente_id,
      cliente: clienteNombre.get(cliente_id) || 'Sin nombre',
      facturacionNeta,
      unidades: unidadesPorCliente.get(cliente_id) ?? 0,
      costeMaterial,
      costeTransporteInterior,
      margenBruto,
      margenBrutoPct,
    });
  }

  filas.sort((a, b) => b.facturacionNeta - a.facturacionNeta);

  const totales = {
    facturacionNeta: filas.reduce((s, f) => s + f.facturacionNeta, 0),
    unidades: filas.reduce((s, f) => s + f.unidades, 0),
    costeMaterial: filas.reduce((s, f) => s + f.costeMaterial, 0),
    costeTransporteInterior: filas.reduce((s, f) => s + f.costeTransporteInterior, 0),
    margenBruto: filas.reduce((s, f) => s + f.margenBruto, 0),
    margenBrutoPct: null as number | null,
  };
  totales.margenBrutoPct = totales.facturacionNeta !== 0 ? (totales.margenBruto / totales.facturacionNeta) * 100 : null;

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    anio,
    filas,
    totales,
  };
}
