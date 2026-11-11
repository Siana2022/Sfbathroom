import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { filtrarPorIds, getFacturaIdsFiltradas, hayFiltros, type Filtros } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { ventasAnioRpc, ventasFiltradoRpc } from '@/lib/datos/ventas';

export type FilaDesvio = {
  nombre: string;
  presupuesto: number;
  neta: number;
  desvio: number;
  desvioPct: number | null;
};

export type DesvioPresupuesto = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  sinPresupuesto: boolean;
  porComercial: FilaDesvio[];
  porCliente: FilaDesvio[];
  porFamilia: FilaDesvio[];
};

type FilaFactura = { id: string; cliente_id: string | null; comercial_id: string | null; base_imponible: number; tipo_documento: string };
type FilaLinea = { factura_id: string; articulo_id: string | null; importe: number };
type FilaArticulo = { id: string; familia: string | null };

export async function getDesvioPresupuesto(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<DesvioPresupuesto> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  // Camino rápido sin filtros: facturas + líneas del año en una sola llamada (RPC ventas_anio).
  const sinFiltros = !filtros || !hayFiltros(filtros);
  const ventas = sinFiltros ? await ventasAnioRpc(supabase, codigoEmpresa, anio) : null;

  let facturas: FilaFactura[];
  let lineas: FilaLinea[];
  if (ventas) {
    facturas = ventas.facturas as unknown as FilaFactura[];
    lineas = ventas.lineas as unknown as FilaLinea[];
  } else {
    // Con filtros: facturas+líneas ya filtradas en SQL (una llamada). Fallback al camino antiguo.
    const ventasFil = await ventasFiltradoRpc(supabase, codigoEmpresa, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`);
    if (ventasFil) {
      facturas = ventasFil.facturas as unknown as FilaFactura[];
      lineas = ventasFil.lineas as unknown as FilaLinea[];
    } else {
      const idsFiltrados = await getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`);
      const filasRaw = await todasLasFilas<FilaFactura>((desde) =>
        supabase
          .from('facturas')
          .select('id, cliente_id, comercial_id, base_imponible, tipo_documento')
          .eq('empresa_id', empresa.id)
          .gte('fecha', `${anio}-01-01`)
          .lte('fecha', `${anio}-12-31`)
          .range(desde, desde + TAMANO_PAGINA - 1)
      );
      facturas = filtrarPorIds(filasRaw, idsFiltrados);
      lineas = facturas.length
        ? await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, importe', facturas.map((f) => f.id))
        : [];
    }
  }

  const netaCliente = new Map<string, number>();
  const netaComercial = new Map<string, number>();
  for (const f of facturas) {
    const base = Number(f.base_imponible ?? 0);
    if (f.cliente_id) netaCliente.set(f.cliente_id, (netaCliente.get(f.cliente_id) ?? 0) + base);
    if (f.comercial_id) netaComercial.set(f.comercial_id, (netaComercial.get(f.comercial_id) ?? 0) + base);
  }
  const tipoFactura = new Map(facturas.map((f) => [f.id, f.tipo_documento]));

  const [presCli, presCom, presFam, cli, com, fam, articulosFam] = await Promise.all([
    supabase.from('presupuesto').select('cliente_id, importe').eq('empresa_id', empresa.id).eq('ejercicio', anio),
    supabase.from('presupuesto').select('comercial_id, importe').eq('empresa_id', empresa.id).eq('ejercicio', anio),
    supabase.from('presupuesto').select('familia_id, importe').eq('empresa_id', empresa.id).eq('ejercicio', anio),
    todasLasFilas<{ id: string; nombre: string }>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    supabase.from('comerciales').select('id, nombre'),
    supabase.from('familias_articulo').select('id, nombre'),
    todasLasFilas<FilaArticulo>((desde) =>
      supabase
        .from('articulos')
        .select('id, familia')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
  ]);

  const familiaDeArticulo = new Map<string, string | null>();
  for (const a of articulosFam) familiaDeArticulo.set(a.id, a.familia);
  const netaFamilia = new Map<string, number>();
  for (const l of lineas) {
    const famLinea = l.articulo_id ? familiaDeArticulo.get(l.articulo_id) : null;
    if (!famLinea) continue;
    const signo = tipoFactura.get(l.factura_id) === 'abono' ? -1 : 1;
    netaFamilia.set(famLinea, (netaFamilia.get(famLinea) ?? 0) + signo * Number(l.importe ?? 0));
  }

  const suma = (filas: { [k: string]: string | number }[] | null, clave: string) => {
    const m = new Map<string, number>();
    for (const f of filas ?? []) {
      const id = String(f[clave] ?? '');
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + Number(f.importe ?? 0));
    }
    return m;
  };
  const presCliMap = suma(presCli.data, 'cliente_id');
  const presComMap = suma(presCom.data, 'comercial_id');
  const famNombrePres = new Map(((fam.data ?? []) as { id: string; nombre: string }[]).map((f) => [f.id, f.nombre]));
  const presFamMap = new Map<string, number>();
  for (const f of (presFam.data ?? []) as { familia_id: string | null; importe: number }[]) {
    const nombreFam = f.familia_id ? famNombrePres.get(f.familia_id) : null;
    if (!nombreFam) continue;
    presFamMap.set(nombreFam, (presFamMap.get(nombreFam) ?? 0) + Number(f.importe ?? 0));
  }

  const nombre = (filas: { id: string; nombre: string }[] | null) => new Map((filas ?? []).map((f) => [f.id, f.nombre]));

  const construir = (neta: Map<string, number>, pres: Map<string, number>, nombres: Map<string, string>): FilaDesvio[] => {
    const claves = new Set([...neta.keys(), ...pres.keys()]);
    return [...claves]
      .filter((id) => (pres.get(id) ?? 0) > 0)
      .map((id) => {
        const presupuesto = pres.get(id) ?? 0;
        const net = neta.get(id) ?? 0;
        return {
          nombre: nombres.get(id) ?? '—',
          presupuesto,
          neta: net,
          desvio: net - presupuesto,
          desvioPct: presupuesto > 0 ? ((net - presupuesto) / presupuesto) * 100 : null,
        };
      })
      .sort((a, b) => (b.desvio - a.desvio) * -1) // primero los mayores desvíos
      .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))
      .slice(0, 10);
  };

  const sinPresupuesto = [...presCliMap.values(), ...presComMap.values(), ...presFamMap.values()].reduce((a, b) => a + b, 0) === 0;

  return {
    empresa,
    anio,
    sinPresupuesto,
    porComercial: construir(netaComercial, presComMap, nombre(com.data)),
    porCliente: construir(netaCliente, presCliMap, new Map(cli.map((c) => [c.id, c.nombre]))),
    porFamilia: construir(netaFamilia, presFamMap, nombre(fam.data)),
  };
}