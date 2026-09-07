import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type CalidadData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  importeDevoluciones: number;
  devolucionPct: number | null;
  incidencias: number;
  abiertas: number;
  margenPerdidoDevoluciones: number;
  plazoMedioResolucion: number | null;
  porTipo: { tipo: string; count: number; importe: number }[];
  porCliente: { nombre: string; count: number; importe: number }[];
  porEstado: { estado: string; count: number }[];
  devolucionesArticulo: { articulo: string; unidades: number; importe: number }[];
  devolucionesFamilia: { familia: string; unidades: number; importe: number }[];
};

const TIPO_LABEL: Record<string, string> = {
  rotura_transporte: 'Rotura en transporte',
  defecto_fabricacion: 'Defecto de fabricación',
  error_pedido: 'Error de pedido',
  error_expedicion: 'Error de expedición',
  rechazo_comercial: 'Rechazo comercial',
};

type Fila = { tipo: string; importe: number; estado: string; cliente_id: string | null };
type FilaAbonoLinea = { articulo_id: string | null; cantidad: number; importe: number; coste_unitario: number | null };

export async function getCalidad(codigoEmpresa: string, anio: number): Promise<CalidadData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  let neta = 0;
  let importeDevoluciones = 0;
  const idsAbonos: string[] = [];
  {
    const { data: filas } = await supabase
      .from('facturas')
      .select('id, tipo_documento, total')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    for (const f of filas ?? []) {
      const total = Number((f as { total: number }).total ?? 0);
      if ((f as { tipo_documento: string }).tipo_documento === 'abono') {
        importeDevoluciones += Math.abs(total);
        idsAbonos.push((f as { id: string }).id);
      } else {
        neta += total;
      }
    }
  }

  const { data: artRaw } = await supabase.from('articulos').select('id, nombre, familia_id').eq('empresa_id', empresa.id);
  const articulos = (artRaw ?? []) as { id: string; nombre: string; familia_id: string | null }[];
  const articuloPorId = new Map(articulos.map((a) => [a.id, a]));
  const { data: famRaw } = await supabase.from('familias_articulo').select('id, nombre');
  const famNombre = new Map((famRaw ?? []).map((f) => [(f as { id: string }).id, (f as { nombre: string }).nombre]));

  const devArticulo = new Map<string, { unidades: number; importe: number }>();
  const devFamilia = new Map<string, { unidades: number; importe: number }>();
  let margenPerdidoDevoluciones = 0;
  if (idsAbonos.length) {
    const { data: lineasRaw } = await supabase
      .from('factura_lineas')
      .select('articulo_id, cantidad, importe, coste_unitario')
      .in('factura_id', idsAbonos);
    for (const l of (lineasRaw ?? []) as FilaAbonoLinea[]) {
      const unidades = Math.abs(Number(l.cantidad ?? 0));
      const importeAbs = Math.abs(Number(l.importe ?? 0));
      const a = l.articulo_id ? articuloPorId.get(l.articulo_id) : undefined;
      const clave = a?.id ?? 'desconocido';
      const dA = devArticulo.get(clave) ?? { unidades: 0, importe: 0 };
      dA.unidades += unidades;
      dA.importe += importeAbs;
      devArticulo.set(clave, dA);
      const fam = (a?.familia_id && famNombre.get(a.familia_id)) ?? 'Sin familia';
      const dF = devFamilia.get(fam) ?? { unidades: 0, importe: 0 };
      dF.unidades += unidades;
      dF.importe += importeAbs;
      devFamilia.set(fam, dF);
      const coste = unidades * Number(l.coste_unitario ?? 0);
      margenPerdidoDevoluciones += Math.max(0, importeAbs - coste);
    }
  }

  const { data: incRaw } = await supabase
    .from('incidencias')
    .select('tipo, importe, estado, cliente_id, fecha, fecha_cierre')
    .eq('empresa_id', empresa.id);
  const incidencias = (incRaw ?? []) as (Fila & { fecha: string; fecha_cierre: string | null })[];

  const tipoMap = new Map<string, { count: number; importe: number }>();
  const estadoMap = new Map<string, number>();
  let abiertas = 0;
  const porClienteRaw = new Map<string, { count: number; importe: number }>();
  let plazoSum = 0;
  let plazoN = 0;
  for (const i of incidencias) {
    const t = tipoMap.get(i.tipo) ?? { count: 0, importe: 0 };
    t.count += 1;
    t.importe += Number(i.importe ?? 0);
    tipoMap.set(i.tipo, t);
    estadoMap.set(i.estado, (estadoMap.get(i.estado) ?? 0) + 1);
    if (i.estado === 'abierta') abiertas += 1;
    if (i.cliente_id) {
      const c = porClienteRaw.get(i.cliente_id) ?? { count: 0, importe: 0 };
      c.count += 1;
      c.importe += Number(i.importe ?? 0);
      porClienteRaw.set(i.cliente_id, c);
    }
    if (i.fecha_cierre) {
      plazoSum += Math.max(0, Math.round((Date.parse(i.fecha_cierre) - Date.parse(i.fecha)) / 86400000));
      plazoN += 1;
    }
  }

  const porClienteIds = [...porClienteRaw.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([id]) => id);
  const nombreCliente = new Map<string, string>();
  if (porClienteIds.length) {
    const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', porClienteIds);
    for (const c of clis ?? []) nombreCliente.set((c as { id: string }).id, (c as { nombre: string }).nombre);
  }
  const porCliente = [...porClienteRaw.entries()]
    .filter(([id]) => porClienteIds.includes(id))
    .map(([id, v]) => ({ nombre: nombreCliente.get(id) ?? '—', count: v.count, importe: v.importe }));

  const porTipo = [...tipoMap.entries()]
    .map(([tipo, v]) => ({ tipo, count: v.count, importe: v.importe }))
    .sort((a, b) => b.importe - a.importe);
  const porEstado = [...estadoMap.entries()]
    .map(([estado, count]) => ({ estado, count }))
    .sort((a, b) => b.count - a.count);
  const devolucionesArticulo = [...devArticulo.entries()]
    .map(([id, v]) => ({ articulo: articuloPorId.get(id)?.nombre ?? '—', unidades: v.unidades, importe: v.importe }))
    .sort((a, b) => b.importe - a.importe)
    .slice(0, 10);
  const devolucionesFamilia = [...devFamilia.entries()]
    .map(([familia, v]) => ({ familia, unidades: v.unidades, importe: v.importe }))
    .sort((a, b) => b.importe - a.importe);

  return {
    empresa,
    anio,
    importeDevoluciones,
    devolucionPct: neta > 0 ? (importeDevoluciones / neta) * 100 : null,
    incidencias: incidencias.length,
    abiertas,
    margenPerdidoDevoluciones,
    plazoMedioResolucion: plazoN > 0 ? plazoSum / plazoN : null,
    porTipo,
    porCliente,
    porEstado,
    devolucionesArticulo,
    devolucionesFamilia,
  };
}