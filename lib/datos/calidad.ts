import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type CalidadData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  importeDevoluciones: number;
  devolucionPct: number | null;
  incidencias: number;
  abiertas: number;
  porTipo: { tipo: string; count: number; importe: number }[];
  porCliente: { nombre: string; count: number; importe: number }[];
};

const TIPO_LABEL: Record<string, string> = {
  rotura_transporte: 'Rotura en transporte',
  defecto_fabricacion: 'Defecto de fabricación',
  error_pedido: 'Error de pedido',
  error_expedicion: 'Error de expedición',
  rechazo_comercial: 'Rechazo comercial',
};

type Fila = { tipo: string; importe: number; estado: string; cliente_id: string | null };

export async function getCalidad(codigoEmpresa: string, anio: number): Promise<CalidadData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  let neta = 0;
  let importeDevoluciones = 0;
  {
    const { data: filas } = await supabase
      .from('facturas')
      .select('tipo_documento, total')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    for (const f of filas ?? []) {
      const total = Number((f as { total: number }).total ?? 0);
      if ((f as { tipo_documento: string }).tipo_documento === 'abono') {
        importeDevoluciones += Math.abs(total);
      } else {
        neta += total;
      }
    }
  }

  const { data: incRaw } = await supabase
    .from('incidencias')
    .select('tipo, importe, estado, cliente_id')
    .eq('empresa_id', empresa.id);
  const incidencias = (incRaw ?? []) as Fila[];

  const tipoMap = new Map<string, { count: number; importe: number }>();
  let abiertas = 0;
  const porClienteRaw = new Map<string, { count: number; importe: number }>();
  for (const i of incidencias) {
    const t = tipoMap.get(i.tipo) ?? { count: 0, importe: 0 };
    t.count += 1;
    t.importe += Number(i.importe ?? 0);
    tipoMap.set(i.tipo, t);
    if (i.estado === 'abierta') abiertas += 1;
    if (i.cliente_id) {
      const c = porClienteRaw.get(i.cliente_id) ?? { count: 0, importe: 0 };
      c.count += 1;
      c.importe += Number(i.importe ?? 0);
      porClienteRaw.set(i.cliente_id, c);
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

  return {
    empresa,
    anio,
    importeDevoluciones,
    devolucionPct: neta > 0 ? (importeDevoluciones / neta) * 100 : null,
    incidencias: incidencias.length,
    abiertas,
    porTipo,
    porCliente,
  };
}