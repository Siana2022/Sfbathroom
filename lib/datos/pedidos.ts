import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type PedidosData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  captados: number;
  importeCaptado: number;
  servidos: number;
  importeServido: number;
  anulados: number;
  importeAnulado: number;
  enCartera: number;
  enCarteraImporte: number;
  enCarteraCliente: { nombre: string; pendiente: number; pedidos: number; antiguedadMedia: number }[];
  porEstado: { estado: string; pedidos: number; importe: number }[];
  ratioServidoVsFacturado: number | null;
  antiguedadMediaCartera: number;
};

const ESTADOS_CARTERA = new Set(['captado', 'aceptado', 'parcial']);

type FilaPedido = {
  id: string;
  cliente_id: string | null;
  estado: string;
  fecha_entrada: string;
  fecha_entrega_real: string | null;
  motivo_anulacion: string | null;
};
type FilaLinea = { pedido_id: string; cantidad: number; cantidad_servida: number; precio_unitario: number; descuento_pct: number };
type FilaCliente = { id: string; nombre: string };

function importeLinea(l: FilaLinea, servida: boolean): number {
  const cant = servida ? Number(l.cantidad_servida ?? 0) : Number(l.cantidad ?? 0);
  return cant * Number(l.precio_unitario ?? 0) * (1 - Number(l.descuento_pct ?? 0) / 100);
}

export async function getPedidos(codigoEmpresa: string, anio: number): Promise<PedidosData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: filas } = await supabase
    .from('pedidos')
    .select('id, cliente_id, estado, fecha_entrada, fecha_entrega_real, motivo_anulacion')
    .eq('empresa_id', empresa.id)
    .gte('fecha_entrada', `${anio}-01-01`)
    .lte('fecha_entrada', `${anio}-12-31`);
  const pedidos = (filas ?? []) as FilaPedido[];

  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const estadoImporte = new Map<string, number>();
  const estadoCount = new Map<string, number>();
  const carteraCliente = new Map<string, { pendiente: number; pedidos: number; antiguedad: number }>();
  let importeServido = 0;
  let importeAnulado = 0;

  if (pedidos.length) {
    const { data: lineas } = await supabase
      .from('pedido_lineas')
      .select('pedido_id, cantidad, cantidad_servida, precio_unitario, descuento_pct')
      .in('pedido_id', pedidos.map((p) => p.id));
    for (const l of (lineas ?? []) as FilaLinea[]) {
      const p = porId.get(l.pedido_id);
      if (!p) continue;
      const imp = importeLinea(l, false);
      estadoImporte.set(p.estado, (estadoImporte.get(p.estado) ?? 0) + imp);
      if (p.estado === 'servido') {
        importeServido += importeLinea(l, true);
      } else if (p.estado === 'anulado') {
        importeAnulado += imp;
      } else if (ESTADOS_CARTERA.has(p.estado)) {
        const pendiente = Math.max(0, Number(l.cantidad ?? 0) - Number(l.cantidad_servida ?? 0)) * Number(l.precio_unitario ?? 0) * (1 - Number(l.descuento_pct ?? 0) / 100);
        const prev = carteraCliente.get(p.cliente_id ?? '') ?? { pendiente: 0, pedidos: 0, antiguedad: 0 };
        prev.pendiente += pendiente;
        prev.pedidos += 1;
        prev.antiguedad += Math.max(0, (Date.now() - Date.parse(`${p.fecha_entrada}T00:00:00Z`)) / 86400000);
        carteraCliente.set(p.cliente_id ?? '', prev);
      }
    }
  }

  for (const p of pedidos) {
    estadoCount.set(p.estado, (estadoCount.get(p.estado) ?? 0) + 1);
  }

  const enCartera = pedidos.filter((p) => ESTADOS_CARTERA.has(p.estado)).length;
  const idClientes = [...carteraCliente.keys()].filter(Boolean);
  const nombreCliente = new Map<string, string>();
  if (idClientes.length) {
    const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', idClientes);
    for (const c of (clis ?? []) as FilaCliente[]) nombreCliente.set(c.id, c.nombre);
  }
  const enCarteraCliente = [...carteraCliente.entries()]
    .map(([id, v]) => ({ nombre: nombreCliente.get(id) ?? '—', pendiente: v.pendiente, pedidos: v.pedidos, antiguedadMedia: v.pedidos > 0 ? v.antiguedad / v.pedidos : 0 }))
    .sort((a, b) => b.pendiente - a.pendiente)
    .slice(0, 10);

  const importeCaptado = [...estadoImporte.values()].reduce((a, b) => a + b, 0);

  const { neta } = await getFacturacionProxy(supabase, empresa.id, anio);
  const ratioServidoVsFacturado = neta > 0 ? (importeServido / neta) * 100 : null;

  const porEstado = [...estadoImporte.entries()]
    .map(([estado, importe]) => ({ estado, pedidos: estadoCount.get(estado) ?? 0, importe }))
    .sort((a, b) => b.importe - a.importe);

  const antiguedadMediaCartera =
    enCarteraCliente.length > 0
      ? enCarteraCliente.reduce((a, c) => a + c.antiguedadMedia * c.pedidos, 0) /
        enCarteraCliente.reduce((a, c) => a + c.pedidos, 0)
      : 0;

  return {
    empresa,
    anio,
    captados: pedidos.length,
    importeCaptado,
    servidos: estadoCount.get('servido') ?? 0,
    importeServido,
    anulados: estadoCount.get('anulado') ?? 0,
    importeAnulado,
    enCartera,
    enCarteraImporte: enCarteraCliente.reduce((a, c) => a + c.pendiente, 0),
    enCarteraCliente,
    porEstado,
    ratioServidoVsFacturado,
    antiguedadMediaCartera,
  };
}

// evita un segundo createClient dentro de getFacturacion
async function getFacturacionProxy(supabase: ReturnType<typeof createClient>, empresaId: string, anio: number): Promise<{ neta: number }> {
  const { data } = await supabase
    .from('facturas')
    .select('total')
    .eq('empresa_id', empresaId)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  let neta = 0;
  for (const f of data ?? []) neta += Number((f as { total: number }).total ?? 0);
  return { neta };
}