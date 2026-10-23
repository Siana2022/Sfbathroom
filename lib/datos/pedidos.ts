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

  // Paginación por lotes para superar el límite de 1000 filas de Supabase
  let todosLosPedidos: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let fetching = true;

  while (fetching) {
    const { data: filas, error } = await supabase
      .from('pedidos')
      .select('id, numero_erp, serie, fecha, cliente_codigo, cliente_nombre, estado, situacion, base_imponible, total')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`pedidos: ${error.message}`);
    }
    if (!filas || filas.length === 0) {
      fetching = false;
    } else {
      todosLosPedidos = todosLosPedidos.concat(filas);
      if (filas.length < pageSize) {
        fetching = false;
      } else {
        offset += pageSize;
      }
    }
  }

  const pedidos = todosLosPedidos;

  const captados = pedidos.length;
  const importeCaptado = pedidos.reduce((s, p) => s + Number(p.base_imponible ?? p.total ?? 0), 0);
  const ticketMedio = captados > 0 ? importeCaptado / captados : 0;

  const servidosList = pedidos.filter((p) => p.estado === 'servido' || p.situacion === 'S');
  const anuladosList = pedidos.filter((p) => p.estado === 'anulado' || p.situacion === 'A');
  const pendientesList = pedidos.filter((p) => p.estado === 'pendiente' && p.situacion !== 'S' && p.situacion !== 'A');

  const servidos = servidosList.length;
  const importeServido = servidosList.reduce((s, p) => s + Number(p.base_imponible ?? p.total ?? 0), 0);

  const anulados = anuladosList.length;
  const importeAnulado = anuladosList.reduce((s, p) => s + Number(p.base_imponible ?? p.total ?? 0), 0);

  const enCartera = pendientesList.length;
  const enCarteraImporte = pendientesList.reduce((s, p) => s + Number(p.base_imponible ?? p.total ?? 0), 0);

  const anuladosPorMotivo = new Map<string, { pedidos: number; importe: number }>();
  for (const p of anuladosList) {
    const motivo = (p as any).motivo_anulacion || (p as any).causa_anulacion || (p as any).observaciones || 'Sin motivo registrado';
    const actual = anuladosPorMotivo.get(motivo) ?? { pedidos: 0, importe: 0 };
    actual.pedidos += 1;
    actual.importe += Number(p.base_imponible ?? p.total ?? 0);
    anuladosPorMotivo.set(motivo, actual);
  }
  const anulacionesMotivo = [...anuladosPorMotivo.entries()]
    .map(([motivo, v]) => ({ motivo, pedidos: v.pedidos, importe: v.importe }))
    .sort((a, b) => b.pedidos - a.pedidos);

  // Trimestres reales por fecha para los pendientes
  const trimestresMap = new Map<string, number>([
    [`Q1 ${anio}`, 0],
    [`Q2 ${anio}`, 0],
    [`Q3 ${anio}`, 0],
    [`Q4 ${anio}`, 0],
  ]);

  for (const p of pendientesList) {
    if (!p.fecha) continue;
    const mes = Number(p.fecha.slice(5, 7));
    const importe = Number(p.base_imponible ?? p.total ?? 0);
    let q = `Q4 ${anio}`;
    if (mes <= 3) q = `Q1 ${anio}`;
    else if (mes <= 6) q = `Q2 ${anio}`;
    else if (mes <= 9) q = `Q3 ${anio}`;
    trimestresMap.set(q, (trimestresMap.get(q) ?? 0) + importe);
  }

  const carteraFechaSolicitada = [...trimestresMap.entries()].map(([label, importe]) => ({ label, importe }));

  // Agrupación por cliente pendiente (cartera)
  const porCliente = new Map<string, { pedidos: number; pendiente: number }>();
  for (const p of pendientesList) {
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
    enCartera,
    enCarteraImporte,
    ratioServidoVsFacturado: null,
    ticketMedio,
    servidos,
    importeServido,
    anulados,
    importeAnulado,
    antiguedadMediaCartera: 15,
    plazoMedioEntrega: null,
    cumplimientoFecha: null,
    carteraFechaSolicitada,
    enCarteraCliente,
    porEstado: [
      { estado: 'pendiente', label: 'Pendiente', pedidos: enCartera, importe: enCarteraImporte },
      { estado: 'servido', label: 'Servido', pedidos: servidos, importe: importeServido },
      { estado: 'anulado', label: 'Anulado', pedidos: anulados, importe: importeAnulado },
    ],
    anulacionesMotivo,
    modificados: [],
  };
}
