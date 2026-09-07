import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getConfiguracionUmbrales } from '@/lib/datos/configuracion';
import { getRol, puedeVerMargenes } from '@/lib/datos/role';

export type ComercialRow = {
  id: string;
  nombre: string;
  neta: number;
  facturas: number;
  clientes: number;
  descuentoMedio: number;
  pedidos: number;
  margenPct: number | null;
  margenAbs: number | null;
  presupuesto: number;
  cumplimientoPct: number | null;
  nuevos: number;
  perdidos: number;
  trimNeta: number;
  saturacionImporte: boolean;
  saturacionClientes: boolean;
};

export type ActividadData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  sinAccesoMargen: boolean;
  comerciales: ComercialRow[];
};

type Fila = { id: string; comercial_id: string | null; cliente_id: string | null; total: number; descuento_pie: number; fecha: string };
type FilaComercial = { id: string; nombre: string };
type FilaPedido = { comercial_id: string | null };
type FilaLinea = { factura_id: string; articulo_id: string | null; cantidad: number; importe: number; coste_unitario: number | null };
type FilaArticulo = { id: string; coste_unitario: number | null };
type FilaPresupuesto = { comercial_id: string | null; importe: number };

const UMBRALES_DEFECTO: Record<string, number> = {
  'comerciales.saturacion_importe': 1500000,
  'comerciales.saturacion_clientes': 60,
};

export async function getActividad(codigoEmpresa: string, anio: number): Promise<ActividadData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;

  const [filasRes, filasPreviasRes, pedidosRes, presupuestoRes, config] = await Promise.all([
    supabase
      .from('facturas')
      .select('id, comercial_id, cliente_id, total, descuento_pie, fecha')
      .eq('empresa_id', empresa.id)
      .eq('tipo_documento', 'factura')
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`),
    supabase
      .from('facturas')
      .select('comercial_id, cliente_id')
      .eq('empresa_id', empresa.id)
      .eq('tipo_documento', 'factura')
      .gte('fecha', `${anioPrevio}-01-01`)
      .lte('fecha', `${anioPrevio}-12-31`),
    supabase
      .from('pedidos')
      .select('comercial_id')
      .eq('empresa_id', empresa.id)
      .gte('fecha_entrada', `${anio}-01-01`)
      .lte('fecha_entrada', `${anio}-12-31`),
    supabase.from('presupuesto').select('comercial_id, importe').eq('empresa_id', empresa.id).eq('ejercicio', anio),
    getConfiguracionUmbrales(),
  ]);

  const filas = (filasRes.data ?? []) as Fila[];
  const filasPrevias = (filasPreviasRes.data ?? []) as { comercial_id: string | null; cliente_id: string | null }[];
  const pedidosPorComercial = new Map<string, number>();
  for (const p of (pedidosRes.data ?? []) as FilaPedido[]) {
    if (p.comercial_id) pedidosPorComercial.set(p.comercial_id, (pedidosPorComercial.get(p.comercial_id) ?? 0) + 1);
  }

  const umbralMap = new Map<string, number>();
  for (const u of config) umbralMap.set(`${u.modulo}.${u.nombre}`, u.umbral ?? UMBRALES_DEFECTO[`${u.modulo}.${u.nombre}`] ?? 0);
  const satImporte = umbralMap.get('comerciales.saturacion_importe') ?? UMBRALES_DEFECTO['comerciales.saturacion_importe'];
  const satClientes = umbralMap.get('comerciales.saturacion_clientes') ?? UMBRALES_DEFECTO['comerciales.saturacion_clientes'];

  // margen por comercial: factura -> línea -> articulo
  const ids = filas.map((f) => f.id);
  const comercialDeFactura = new Map<string, string | null>();
  for (const f of filas) {
    comercialDeFactura.set(f.id, f.comercial_id);
  }

  let lineas: FilaLinea[] = [];
  if (ids.length) {
    const { data } = await supabase.from('factura_lineas').select('factura_id, articulo_id, cantidad, importe, coste_unitario').in('factura_id', ids);
    lineas = (data ?? []) as FilaLinea[];
  }
  const articuloCoste = new Map<string, number | null>();
  if (lineas.length) {
    const artIds = [...new Set(lineas.map((l) => l.articulo_id).filter(Boolean))] as string[];
    if (artIds.length) {
      const { data: articulosRaw } = await supabase.from('articulos').select('id, coste_unitario').in('id', artIds);
      for (const a of (articulosRaw ?? []) as FilaArticulo[]) articuloCoste.set(a.id, a.coste_unitario);
    }
  }

  const porComercial = new Map<
    string,
    { neta: number; trimNeta: number; facturas: number; clientes: Set<string>; descuento: number; margenImporte: number; margenCoste: number }
  >();
  const clientesPrevio = new Map<string, Set<string>>();

  const mesActual = new Date().getMonth() + 1;
  const trimActual = Math.floor((mesActual - 1) / 3) + 1;

  for (const f of filas) {
    const key = f.comercial_id ?? '';
    const c = porComercial.get(key) ?? { neta: 0, trimNeta: 0, facturas: 0, clientes: new Set<string>(), descuento: 0, margenImporte: 0, margenCoste: 0 };
    c.neta += Number(f.total ?? 0);
    c.facturas += 1;
    if (f.cliente_id) c.clientes.add(f.cliente_id);
    c.descuento += Number(f.descuento_pie ?? 0);
    const trim = Math.floor((Number(f.fecha.slice(5, 7)) - 1) / 3) + 1;
    if (trim === trimActual) c.trimNeta += Number(f.total ?? 0);
    porComercial.set(key, c);
  }

  for (const l of lineas) {
    const comercialId = comercialDeFactura.get(l.factura_id);
    const key = comercialId ?? '';
    const c = porComercial.get(key);
    if (!c) continue;
    c.margenImporte += Number(l.importe ?? 0);
    const coste = Number(l.coste_unitario ?? articuloCoste.get(l.articulo_id ?? '') ?? 0);
    c.margenCoste += Number(l.cantidad ?? 0) * coste;
  }

  for (const f of filasPrevias) {
    const key = f.comercial_id ?? '';
    const set = clientesPrevio.get(key) ?? new Set<string>();
    if (f.cliente_id) set.add(f.cliente_id);
    clientesPrevio.set(key, set);
  }

  const presupuestoPorComercial = new Map<string, number>();
  for (const p of (presupuestoRes.data ?? []) as FilaPresupuesto[]) {
    if (p.comercial_id) presupuestoPorComercial.set(p.comercial_id, (presupuestoPorComercial.get(p.comercial_id) ?? 0) + Number(p.importe ?? 0));
  }

  const { data: comerciales } = await supabase.from('comerciales').select('id, nombre').eq('activo', true);
  const filasComerciales = (comerciales ?? []) as FilaComercial[];

  const rol = await getRol();
  const sinAccesoMargen = !puedeVerMargenes(rol);

  const comercialesRes: ComercialRow[] = filasComerciales.map((c) => {
    const v = porComercial.get(c.id);
    const previo = clientesPrevio.get(c.id);
    const activosAnio = v?.clientes ?? new Set<string>();

    const margenImporte = v?.margenImporte ?? 0;
    const margeCoste = v?.margenCoste ?? 0;
    const presupuesto = presupuestoPorComercial.get(c.id) ?? 0;
    const nuevos = [...activosAnio].filter((x) => !previo?.has(x)).length;
    const perdidos = [...(previo ?? [])].filter((x) => !activosAnio.has(x)).length;

    return {
      id: c.id,
      nombre: c.nombre,
      neta: v?.neta ?? 0,
      facturas: v?.facturas ?? 0,
      clientes: activosAnio.size,
      descuentoMedio: v && v.facturas > 0 ? v.descuento / v.facturas : 0,
      pedidos: pedidosPorComercial.get(c.id) ?? 0,
      margenPct: sinAccesoMargen || margenImporte <= 0 ? null : ((margenImporte - margeCoste) / margenImporte) * 100,
      margenAbs: sinAccesoMargen ? null : margenImporte - margeCoste,
      presupuesto,
      cumplimientoPct: presupuesto > 0 ? ((v?.neta ?? 0) / presupuesto) * 100 : null,
      nuevos,
      perdidos,
      trimNeta: v?.trimNeta ?? 0,
      saturacionImporte: (v?.trimNeta ?? 0) > satImporte,
      saturacionClientes: activosAnio.size > satClientes,
    };
  }).sort((a, b) => b.neta - a.neta);

  return { empresa, anio, sinAccesoMargen, comerciales: comercialesRes };
}