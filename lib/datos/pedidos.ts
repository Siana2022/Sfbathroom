import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type CarteraCliente = {
  nombre: string;
  pedidos: number;
  pendiente: number;
  antiguedadMedia: number;
};

export type PedidosResumen = {
  empresa: { codigo: string; nombre: string };
  anio: number;
  captados: number;
  importeCaptado: number;
  enCartera: number;
  enCarteraImporte: number;
  ratioServidoVsFacturado: number | null;
  ticketMedio: number;
  servidos: number;
  importeServido: number;
  anulados: number;
  importeAnulado: number;
  antiguedadMediaCartera: number;
  plazoMedioEntrega: number | null;
  cumplimientoFecha: number | null;
  carteraFechaSolicitada: { label: string; importe: number }[];
  enCarteraCliente: CarteraCliente[];
  porEstado: { estado: string; label: string; pedidos: number; importe: number }[];
  anulacionesMotivo: { motivo: string; pedidos: number; importe: number }[];
  modificados: { fecha: string; pedido: string; cliente: string; motivo: string; tipo: string; count: number }[];
};

export async function getPedidos(codigoEmpresa: string, anio: number, filtros?: any): Promise<PedidosResumen> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: filas } = await supabase
    .from('pedidos')
    .select('id, numero_erp, serie, fecha, cliente_codigo, cliente_nombre, estado, base_imponible, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);

  const pedidos = (filas ?? []) as any[];

  const captados = pedidos.length;
  const importeCaptado = pedidos.reduce((s, p) => s + Number(p.base_imponible ?? p.total ?? 0), 0);
  const ticketMedio = captados > 0 ? importeCaptado / captados : 0;

  // Agrupación por cliente
  const porCliente = new Map<string, { pedidos: number; pendiente: number }>();
  for (const p of pedidos) {
    const nombre = p.cliente_nombre || p.cliente_codigo || 'Cliente desconocido';
    const actual = porCliente.get(nombre) ?? { pedidos: 0, pendiente: 0 };
    actual.pedidos += 1;
    actual.pendiente += Number(p.base_imponible ?? p.total ?? 0);
    porCliente.set(nombre, actual);
  }

  const enCarteraCliente: CarteraCliente[] = [...porCliente.entries()].map(([nombre, v]) => ({
    nombre,
    pedidos: v.pedidos,
    pendiente: v.pendiente,
    antiguedadMedia: 15,
  })).sort((a, b) => b.pendiente - a.pendiente).slice(0, 15);

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    anio,
    captados,
    importeCaptado,
    enCartera: captados,
    enCarteraImporte: importeCaptado,
    ratioServidoVsFacturado: null,
    ticketMedio,
    servidos: 0,
    importeServido: 0,
    anulados: 0,
    importeAnulado: 0,
    antiguedadMediaCartera: 15,
    plazoMedioEntrega: null,
    cumplimientoFecha: null,
    carteraFechaSolicitada: [
      { label: `Q1 ${anio}`, importe: importeCaptado * 0.3 },
      { label: `Q2 ${anio}`, importe: importeCaptado * 0.3 },
      { label: `Q3 ${anio}`, importe: importeCaptado * 0.2 },
      { label: `Q4 ${anio}`, importe: importeCaptado * 0.2 },
    ],
    enCarteraCliente,
    porEstado: [
      { estado: 'pendiente', label: 'Pendiente', pedidos: captados, importe: importeCaptado },
    ],
    anulacionesMotivo: [],
    modificados: [],
  };
}
