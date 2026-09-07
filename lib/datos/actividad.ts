import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type ActividadData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  comerciales: { id: string; nombre: string; neta: number; facturas: number; clientes: number; descuentoMedio: number; pedidos: number }[];
};

type Fila = { comercial_id: string | null; cliente_id: string | null; total: number; descuento_pie: number };
type FilaComercial = { id: string; nombre: string };
type FilaPedido = { comercial_id: string | null };

export async function getActividad(codigoEmpresa: string, anio: number): Promise<ActividadData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: filasRaw } = await supabase
    .from('facturas')
    .select('comercial_id, cliente_id, total, descuento_pie')
    .eq('empresa_id', empresa.id)
    .eq('tipo_documento', 'factura')
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const filas = (filasRaw ?? []) as Fila[];

  const { data: pedidosRaw } = await supabase
    .from('pedidos')
    .select('comercial_id')
    .eq('empresa_id', empresa.id)
    .gte('fecha_entrada', `${anio}-01-01`)
    .lte('fecha_entrada', `${anio}-12-31`);
  const pedidosPorComercial = new Map<string, number>();
  for (const p of (pedidosRaw ?? []) as FilaPedido[]) {
    if (p.comercial_id) pedidosPorComercial.set(p.comercial_id, (pedidosPorComercial.get(p.comercial_id) ?? 0) + 1);
  }

  const porComercial = new Map<string, { neta: number; facturas: number; clientes: Set<string>; descuento: number }>();
  for (const f of filas) {
    const key = f.comercial_id ?? '';
    const c = porComercial.get(key) ?? { neta: 0, facturas: 0, clientes: new Set<string>(), descuento: 0 };
    c.neta += Number(f.total ?? 0);
    c.facturas += 1;
    if (f.cliente_id) c.clientes.add(f.cliente_id);
    c.descuento += Number(f.descuento_pie ?? 0);
    porComercial.set(key, c);
  }

  const { data: comerciales } = await supabase.from('comerciales').select('id, nombre').eq('activo', true);
  const filasComerciales = (comerciales ?? []) as FilaComercial[];

  const comercialesRes = filasComerciales.map((c) => {
    const v = porComercial.get(c.id);
    return {
      id: c.id,
      nombre: c.nombre,
      neta: v?.neta ?? 0,
      facturas: v?.facturas ?? 0,
      clientes: v?.clientes.size ?? 0,
      descuentoMedio: v && v.facturas > 0 ? v.descuento / v.facturas : 0,
      pedidos: pedidosPorComercial.get(c.id) ?? 0,
    };
  }).sort((a, b) => b.neta - a.neta);

  return { empresa, anio, comerciales: comercialesRes };
}