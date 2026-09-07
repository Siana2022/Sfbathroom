import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { filtrarPorIds, getPedidoIdsFiltrados, getFacturaIdsFiltradas, type Filtros } from '@/lib/datos/filtros';

export type PedidosData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  captados: number;
  importeCaptado: number;
  ticketMedio: number;
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
  carteraFechaSolicitada: { label: string; importe: number }[];
  anulacionesMotivo: { motivo: string; pedidos: number; importe: number }[];
  modificados: { tipo: string; count: number }[];
  plazoMedioEntrega: number | null;
  cumplimientoFecha: number | null;
};

const ESTADOS_CARTERA = new Set(['captado', 'aceptado', 'parcial']);

type FilaPedido = {
  id: string;
  cliente_id: string | null;
  estado: string;
  fecha_entrada: string;
  fecha_solicitada: string | null;
  fecha_entrega_real: string | null;
  motivo_anulacion: string | null;
};
type FilaLinea = { pedido_id: string; cantidad: number; cantidad_servida: number; precio_unitario: number; descuento_pct: number };
type FilaCliente = { id: string; nombre: string };
type FilaModificacion = { tipo: string };

const DIA_MS = 86400000;

function diasEntre(a: string, b: string): number {
  return Math.floor((Date.parse(b) - Date.parse(a)) / DIA_MS);
}

function importeLinea(l: FilaLinea, servida: boolean): number {
  const cant = servida ? Number(l.cantidad_servida ?? 0) : Number(l.cantidad ?? 0);
  return cant * Number(l.precio_unitario ?? 0) * (1 - Number(l.descuento_pct ?? 0) / 100);
}

export async function getPedidos(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<PedidosData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const idsFiltrados = await getPedidoIdsFiltrados(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`);

  const { data: filas } = await supabase
    .from('pedidos')
    .select('id, cliente_id, estado, fecha_entrada, fecha_solicitada, fecha_entrega_real, motivo_anulacion')
    .eq('empresa_id', empresa.id)
    .gte('fecha_entrada', `${anio}-01-01`)
    .lte('fecha_entrada', `${anio}-12-31`);
  const pedidos = filtrarPorIds((filas ?? []) as FilaPedido[], idsFiltrados);

  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const estadoImporte = new Map<string, number>();
  const estadoCount = new Map<string, number>();
  const carteraCliente = new Map<string, { pendiente: number; pedidos: number; antiguedad: number }>();
  const importePedido = new Map<string, number>();
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
      importePedido.set(l.pedido_id, (importePedido.get(l.pedido_id) ?? 0) + imp);
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
        prev.antiguedad += Math.max(0, diasEntre(p.fecha_entrada, new Date(Date.now()).toISOString().slice(0, 10)));
        carteraCliente.set(p.cliente_id ?? '', prev);
      }
    }
  }

  for (const p of pedidos) estadoCount.set(p.estado, (estadoCount.get(p.estado) ?? 0) + 1);

  const hoyDia = Math.floor(Date.now() / DIA_MS);
  const carteraFecha = new Map<string, number>();
  for (const p of pedidos) {
    if (!ESTADOS_CARTERA.has(p.estado)) continue;
    const importe = importePedido.get(p.id) ?? 0;
    const label = p.fecha_solicitada
      ? (() => {
          const dias = Math.floor(Date.parse(`${p.fecha_solicitada}T00:00:00Z`) / DIA_MS) - hoyDia;
          if (dias <= 30) return '0-30 días';
          if (dias <= 60) return '31-60 días';
          if (dias <= 90) return '61-90 días';
          return 'más de 90 días';
        })()
      : 'sin compromiso';
    carteraFecha.set(label, (carteraFecha.get(label) ?? 0) + importe);
  }
  const ORDEN_CARTERA = ['0-30 días', '31-60 días', '61-90 días', 'más de 90 días', 'sin compromiso'];
  const carteraFechaSolicitada = ORDEN_CARTERA.map((label) => ({ label, importe: carteraFecha.get(label) ?? 0 }));

  const anulacionesMotivo: { motivo: string; pedidos: number; importe: number }[] = [];
  {
    const counts = new Map<string, { pedidos: number; importe: number }>();
    for (const p of pedidos) {
      if (p.estado !== 'anulado' || !p.motivo_anulacion) continue;
      const c = counts.get(p.motivo_anulacion) ?? { pedidos: 0, importe: 0 };
      c.pedidos += 1;
      c.importe += importePedido.get(p.id) ?? 0;
      counts.set(p.motivo_anulacion, c);
    }
    for (const [motivo, v] of counts.entries()) anulacionesMotivo.push({ motivo, pedidos: v.pedidos, importe: v.importe });
    anulacionesMotivo.sort((a, b) => b.importe - a.importe);
  }

  let servidosConEntrega = 0;
  let plazoSum = 0;
  let servidosConCompromiso = 0;
  let cumplidos = 0;
  for (const p of pedidos) {
    if (p.estado !== 'servido') continue;
    if (p.fecha_entrega_real) {
      servidosConEntrega += 1;
      plazoSum += Math.max(0, diasEntre(p.fecha_entrada, p.fecha_entrega_real));
    }
    if (p.fecha_solicitada) {
      servidosConCompromiso += 1;
      if (p.fecha_entrega_real && p.fecha_entrega_real <= p.fecha_solicitada) cumplidos += 1;
    }
  }
  const plazoMedioEntrega = servidosConEntrega > 0 ? plazoSum / servidosConEntrega : null;
  const cumplimientoFecha = servidosConCompromiso > 0 ? (cumplidos / servidosConCompromiso) * 100 : null;

  const modificados: { tipo: string; count: number }[] = [];
  if (pedidos.length) {
    const { data: mods } = await supabase
      .from('pedido_modificaciones')
      .select('tipo')
      .in('pedido_id', pedidos.map((p) => p.id));
    const counts = new Map<string, number>();
    for (const m of (mods ?? []) as FilaModificacion[]) counts.set(m.tipo, (counts.get(m.tipo) ?? 0) + 1);
    for (const [tipo, count] of counts.entries()) modificados.push({ tipo, count });
    modificados.sort((a, b) => b.count - a.count);
  }

  const enCartera = pedidos.filter((p) => ESTADOS_CARTERA.has(p.estado)).length;
  const idClientes = [...carteraCliente.keys()].filter(Boolean);
  const nombreCliente = new Map<string, string>();
  if (idClientes.length) {
    const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', idClientes);
    for (const c of (clis ?? []) as FilaCliente[]) nombreCliente.set(c.id, c.nombre);
  }
  const enCarteraClienteFull = [...carteraCliente.entries()]
    .map(([id, v]) => ({ nombre: nombreCliente.get(id) ?? '—', pendiente: v.pendiente, pedidos: v.pedidos, antiguedadMedia: v.pedidos > 0 ? v.antiguedad / v.pedidos : 0 }))
    .sort((a, b) => b.pendiente - a.pendiente);
  const enCarteraCliente = enCarteraClienteFull.slice(0, 10);

  const importeCaptado = [...estadoImporte.values()].reduce((a, b) => a + b, 0);
  const captadosNoAnulados = pedidos.filter((p) => p.estado !== 'anulado').length;
  const ticketMedio = captadosNoAnulados > 0 ? importeCaptado / captadosNoAnulados : 0;

  const { neta } = await getFacturacionProxy(supabase, empresa.id, anio, filtros);
  const ratioServidoVsFacturado = neta > 0 ? (importeServido / neta) * 100 : null;

  const porEstado = [...estadoImporte.entries()]
    .map(([estado, importe]) => ({ estado, pedidos: estadoCount.get(estado) ?? 0, importe }))
    .sort((a, b) => b.importe - a.importe);

  const antiguedadMediaCartera =
    enCarteraClienteFull.length > 0
      ? enCarteraClienteFull.reduce((a, c) => a + c.antiguedadMedia * c.pedidos, 0) /
        enCarteraClienteFull.reduce((a, c) => a + c.pedidos, 0)
      : 0;

  return {
    empresa,
    anio,
    captados: pedidos.length,
    importeCaptado,
    ticketMedio,
    servidos: estadoCount.get('servido') ?? 0,
    importeServido,
    anulados: estadoCount.get('anulado') ?? 0,
    importeAnulado,
    enCartera,
    enCarteraImporte: enCarteraClienteFull.reduce((a, c) => a + c.pendiente, 0),
    enCarteraCliente,
    porEstado,
    ratioServidoVsFacturado,
    antiguedadMediaCartera,
    carteraFechaSolicitada,
    anulacionesMotivo,
    modificados,
    plazoMedioEntrega,
    cumplimientoFecha,
  };
}

// evita un segundo createClient dentro de getFacturacion
async function getFacturacionProxy(
  supabase: ReturnType<typeof createClient>,
  empresaId: string,
  anio: number,
  filtros?: Filtros,
): Promise<{ neta: number }> {
  const idsFiltrados = await getFacturaIdsFiltradas(supabase, empresaId, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`);
  const { data } = await supabase
    .from('facturas')
    .select('id, total')
    .eq('empresa_id', empresaId)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  let neta = 0;
  for (const f of (data ?? []) as { id: string; total: number }[]) {
    if (idsFiltrados && !idsFiltrados.has(f.id)) continue;
    neta += Number(f.total ?? 0);
  }
  return { neta };
}