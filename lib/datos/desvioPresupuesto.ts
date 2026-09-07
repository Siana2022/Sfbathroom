import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { filtrarPorIds, getFacturaIdsFiltradas, type Filtros } from '@/lib/datos/filtros';

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

type FilaFactura = { id: string; cliente_id: string | null; comercial_id: string | null; total: number };
type FilaLinea = { factura_id: string; articulo_id: string | null; importe: number };
type FilaArticulo = { id: string; familia_id: string | null };

export async function getDesvioPresupuesto(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<DesvioPresupuesto> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const idsFiltrados = await getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`);

  const { data: filasRaw } = await supabase
    .from('facturas')
    .select('id, cliente_id, comercial_id, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const facturas = filtrarPorIds((filasRaw ?? []) as FilaFactura[], idsFiltrados);
  const ids = facturas.map((f) => f.id);

  const netaCliente = new Map<string, number>();
  const netaComercial = new Map<string, number>();
  for (const f of facturas) {
    const total = Number(f.total ?? 0);
    if (f.cliente_id) netaCliente.set(f.cliente_id, (netaCliente.get(f.cliente_id) ?? 0) + total);
    if (f.comercial_id) netaComercial.set(f.comercial_id, (netaComercial.get(f.comercial_id) ?? 0) + total);
  }

  const netaFamilia = new Map<string, number>();
  if (ids.length) {
    const { data: lineasRaw } = await supabase
      .from('factura_lineas')
      .select('factura_id, articulo_id, importe')
      .in('factura_id', ids);
    const lineas = (lineasRaw ?? []) as FilaLinea[];
    const artIds = [...new Set(lineas.map((l) => l.articulo_id).filter(Boolean))] as string[];
    const familiaDeArticulo = new Map<string, string | null>();
    if (artIds.length) {
      const { data: articulosRaw } = await supabase.from('articulos').select('id, familia_id').in('id', artIds);
      for (const a of (articulosRaw ?? []) as FilaArticulo[]) familiaDeArticulo.set(a.id, a.familia_id);
    }
    for (const l of lineas) {
      const fam = l.articulo_id ? familiaDeArticulo.get(l.articulo_id) : null;
      if (!fam) continue;
      netaFamilia.set(fam, (netaFamilia.get(fam) ?? 0) + Number(l.importe ?? 0));
    }
  }

  const [presCli, presCom, presFam, cli, com, fam] = await Promise.all([
    supabase.from('presupuesto').select('cliente_id, importe').eq('empresa_id', empresa.id).eq('ejercicio', anio),
    supabase.from('presupuesto').select('comercial_id, importe').eq('empresa_id', empresa.id).eq('ejercicio', anio),
    supabase.from('presupuesto').select('familia_id, importe').eq('empresa_id', empresa.id).eq('ejercicio', anio),
    supabase.from('clientes').select('id, nombre').eq('empresa_id', empresa.id),
    supabase.from('comerciales').select('id, nombre'),
    supabase.from('familias_articulo').select('id, nombre'),
  ]);

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
  const presFamMap = suma(presFam.data, 'familia_id');

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
    porCliente: construir(netaCliente, presCliMap, nombre(cli.data)),
    porFamilia: construir(netaFamilia, presFamMap, nombre(fam.data)),
  };
}