import { createClient } from '@/lib/supabase/server';

export type LineaPedido = {
  id: string;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  precio: number;
  descuento: number;
  importe: number;
  lote: string | null;
  origen: string | null;
};

export type PedidoCliente = {
  id: string;
  numero: string | null;
  fecha: string;
  estado: string;
  total: number | null;
  lineas: LineaPedido[];
};

export type PrecioCliente = {
  articulo: string | null;
  precio: number;
  unidades: number | null;
  desde: string | null;
  hasta: string | null;
  cliente: string | null;
};

export async function getPedidosCliente(clienteId: string, limite = 10): Promise<PedidoCliente[]> {
  const supabase = createClient();
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id, numero_erp, fecha_entrada, estado, total')
    .eq('cliente_id', clienteId)
    .order('fecha_entrada', { ascending: false })
    .limit(limite);

  const lista = (pedidos ?? []) as { id: string; numero_erp: string | null; fecha_entrada: string; estado: string; total: number | null }[];
  if (lista.length === 0) return [];

  const { data: lineas } = await supabase
    .from('pedido_lineas')
    .select('id, pedido_id, codigo_articulo, descripcion, cantidad, precio_unitario, descuento_pct, importe, lote, origen_precio')
    .in('pedido_id', lista.map((p) => p.id))
    .order('numero_linea');

  const porPedido = new Map<string, LineaPedido[]>();
  for (const l of (lineas ?? []) as {
    id: string;
    pedido_id: string;
    codigo_articulo: string | null;
    descripcion: string | null;
    cantidad: number;
    precio_unitario: number;
    descuento_pct: number;
    importe: number;
    lote: string | null;
    origen_precio: string | null;
  }[]) {
    const arr = porPedido.get(l.pedido_id) ?? [];
    arr.push({
      id: l.id,
      codigo: l.codigo_articulo,
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      precio: Number(l.precio_unitario),
      descuento: Number(l.descuento_pct),
      importe: Number(l.importe),
      lote: l.lote,
      origen: l.origen_precio,
    });
    porPedido.set(l.pedido_id, arr);
  }

  return lista.map((p) => ({
    id: p.id,
    numero: p.numero_erp,
    fecha: p.fecha_entrada,
    estado: p.estado,
    total: p.total === null ? null : Number(p.total),
    lineas: porPedido.get(p.id) ?? [],
  }));
}

export async function getPreciosFamilia(limite = 40): Promise<{ proveedor: string | null; articulo: string | null; precio: number; unidades: number | null }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('precios_especiales')
    .select('codigo_proveedor, codigo_articulo, precio, unidades')
    .is('codigo_cliente', null)
    .not('codigo_proveedor', 'is', null)
    .order('codigo_proveedor')
    .limit(limite);
  return ((data ?? []) as { codigo_proveedor: string | null; codigo_articulo: string | null; precio: number; unidades: number | null }[]).map((p) => ({
    proveedor: p.codigo_proveedor,
    articulo: p.codigo_articulo,
    precio: Number(p.precio),
    unidades: p.unidades === null ? null : Number(p.unidades),
  }));
}

export async function getPreciosCliente(codigoCliente: string | null, limite = 60): Promise<PrecioCliente[]> {
  if (!codigoCliente) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from('precios_especiales')
    .select('codigo_articulo, precio, unidades, fecha_desde, fecha_hasta, codigo_cliente')
    .eq('codigo_cliente', codigoCliente.trim())
    .order('codigo_articulo')
    .order('unidades')
    .limit(limite);
  return ((data ?? []) as {
    codigo_articulo: string | null;
    precio: number;
    unidades: number | null;
    fecha_desde: string | null;
    fecha_hasta: string | null;
    codigo_cliente: string | null;
  }[]).map((p) => ({
    articulo: p.codigo_articulo,
    precio: Number(p.precio),
    unidades: p.unidades === null ? null : Number(p.unidades),
    desde: p.fecha_desde,
    hasta: p.fecha_hasta,
    cliente: p.codigo_cliente,
  }));
}

export async function getReunionesCliente(clienteId: string, limite = 10) {
  const supabase = createClient();
  const { data } = await supabase
    .from('agenda')
    .select('id, fecha, hora, asunto, estado, contacto_nombre')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
    .limit(limite);
  return ((data ?? []) as { id: string; fecha: string; hora: string | null; asunto: string; estado: string | null; contacto_nombre: string | null }[]).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    hora: r.hora,
    asunto: r.asunto,
    estado: r.estado,
    contacto: r.contacto_nombre,
  }));
}
