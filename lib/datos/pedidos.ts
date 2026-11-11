import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import type { Filtros } from '@/lib/datos/filtros';
import { diasEntre, hoyISO, sumarDias, sumarDiasHabiles } from '@/lib/fechas';
import { TAMANO_PAGINA, todasLasFilas } from '@/lib/datos/query';

/**
 * Pedidos y cartera.
 *
 * Reglas de negocio acordadas con el cliente (nov 2026):
 * - Un pedido está **facturado** si existe una factura enlazada por `pedido_id`.
 *   Si la ingesta aún no rellena ese enlace, se cae a la situación del pedido
 *   (`situacion`/`estado`) y se avisa en pantalla (`sinEnlaceFacturas`).
 * - Un pedido está **abierto** (cartera) si no está anulado ni facturado.
 * - Un pedido es **programado** si su fecha de entrega (`fecha_prometida`) no
 *   coincide con la fecha de registro (`fecha`). Los programados se excluyen del
 *   plazo medio de entrada → entrega y del cálculo de fuera de plazo estándar.
 * - Entrega prevista: la `fecha_prometida` si existe; si no, fecha de entrada +
 *   21 días naturales en DOT y + 5 días hábiles en SF y FUX.
 */

/** Máximo de pedidos que se envían al navegador por cada desplegable. */
const MAX_DETALLE = 100;

const PLAZO_DOT_DIAS = 21;
const PLAZO_SF_FUX_DIAS_HABILES = 5;

type FilaPedido = {
  id: string;
  numero_erp: string | null;
  serie: string | null;
  fecha: string | null;
  fecha_entrada: string | null;
  fecha_prometida: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  comercial_id: string | null;
  estado: string | null;
  situacion: string | null;
  base_imponible: number | string | null;
  total: number | string | null;
};

type FilaFacturaPedido = {
  id: string;
  pedido_id: string | null;
  fecha: string | null;
  tipo_documento: string | null;
  pedido_fecha: string | null;
  pedido_entrega: string | null;
  base_imponible: number | string | null;
  total: number | string | null;
};

export type PedidoDetalle = {
  id: string;
  numero: string;
  cliente: string;
  fechaEntrada: string | null;
  fechaPrevista: string | null;
  fechaFactura: string | null;
  importe: number;
  diasRetraso: number | null;
};

export type PedidoFueraPlazo = {
  id: string;
  numero: string;
  cliente: string;
  fechaPrevista: string;
  diasRetraso: number;
  importe: number;
};

export type CarteraCliente = {
  nombre: string;
  pedidos: number;
  pendiente: number;
  antiguedadMedia: number;
  entradaMasAntigua: string | null;
  proximaEntrega: string | null;
  diasHastaEntrega: number | null;
};

export type EstadoPedidos = {
  estado: 'pendiente' | 'servido' | 'anulado';
  label: string;
  pedidos: number;
  importe: number;
  /** Total de pedidos en el estado (puede ser mayor que `detalle.length`). */
  total: number;
  detalle: PedidoDetalle[];
};

export type PedidosResumen = {
  empresa: { codigo: string; nombre: string };
  anio: number;
  captados: number;
  importeCaptado: number;
  ticketMedio: number;
  pendientes: number;
  importePendiente: number;
  servidos: number;
  importeServido: number;
  anulados: number;
  importeAnulado: number;
  antiguedadMediaCartera: number;
  plazoMedioEntrega: number | null;
  programados: number;
  importeProgramado: number;
  cumplimientoFecha: number | null;
  fueraPlazo: PedidoFueraPlazo[];
  fueraPlazoTotal: number;
  carteraCliente: CarteraCliente[];
  porEstado: EstadoPedidos[];
  sinEnlaceFacturas: boolean;
};

function importeDe(p: FilaPedido): number {
  return Number(p.base_imponible ?? p.total ?? 0);
}

function entradaDe(p: FilaPedido): string | null {
  return p.fecha ?? p.fecha_entrada;
}

function etiquetaPedido(p: FilaPedido): string {
  if (!p.numero_erp) return '—';
  return p.serie ? `${p.serie}/${p.numero_erp}` : p.numero_erp;
}

export async function getPedidos(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<PedidosResumen> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const desde = filtros?.desde ?? `${anio}-01-01`;
  const hasta = filtros?.hasta ?? `${anio}-12-31`;

  const pedidos = await todasLasFilas<FilaPedido>((offset) => {
    let q = supabase
      .from('pedidos')
      .select(
        'id, numero_erp, serie, fecha, fecha_entrada, fecha_prometida, cliente_id, cliente_nombre, ' +
          'comercial_id, estado, situacion, base_imponible, total',
      )
      .eq('empresa_id', empresa.id)
      .gte('fecha', desde)
      .lte('fecha', hasta);
    if (filtros?.cliente) q = q.eq('cliente_id', filtros.cliente);
    if (filtros?.comercial) q = q.eq('comercial_id', filtros.comercial);
    return q.range(offset, offset + TAMANO_PAGINA - 1);
  });

  // Facturas enlazadas a pedidos. Se mira hasta marzo del año siguiente porque un
  // pedido de diciembre se factura habitualmente en enero.
  const facturas = await todasLasFilas<FilaFacturaPedido>((offset) => {
    let q = supabase
      .from('facturas')
      .select('id, pedido_id, fecha, tipo_documento')
      .eq('empresa_id', empresa.id)
      .not('pedido_id', 'is', null)
      .in('tipo_documento', ['factura', 'nota_cargo'])
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio + 1}-03-31`);
    if (filtros?.cliente) q = q.eq('cliente_id', filtros.cliente);
    return q.range(offset, offset + TAMANO_PAGINA - 1);
  });

  // Primera factura de cada pedido: es la que marca la salida real.
  const facturaPorPedido = new Map<string, string>();
  for (const f of facturas) {
    if (!f.pedido_id || !f.fecha) continue;
    const previa = facturaPorPedido.get(f.pedido_id);
    if (!previa || f.fecha < previa) facturaPorPedido.set(f.pedido_id, f.fecha);
  }

  // Si no hay ni una factura enlazada, el enlace pedido→factura aún no está
  // poblado en producción: se usa la situación del pedido y se avisa en la página.
  const sinEnlaceFacturas = pedidos.length > 0 && facturas.length === 0;

  const esAnulado = (p: FilaPedido) => p.estado === 'anulado' || p.situacion === 'A';
  const esServido = (p: FilaPedido) =>
    sinEnlaceFacturas
      ? p.estado === 'servido' || p.situacion === 'S'
      : facturaPorPedido.has(p.id);
  const esProgramado = (p: FilaPedido) =>
    Boolean(p.fecha_prometida && p.fecha && p.fecha_prometida !== p.fecha);

  function fechaPrevista(p: FilaPedido): string | null {
    if (p.fecha_prometida) return p.fecha_prometida;
    const entrada = entradaDe(p);
    if (!entrada) return null;
    return empresa.codigo === 'DOT'
      ? sumarDias(entrada, PLAZO_DOT_DIAS)
      : sumarDiasHabiles(entrada, PLAZO_SF_FUX_DIAS_HABILES);
  }

  const hoy = hoyISO();
  const servidosList = pedidos.filter((p) => !esAnulado(p) && esServido(p));
  const anuladosList = pedidos.filter(esAnulado);
  const pendientesList = pedidos.filter((p) => !esAnulado(p) && !esServido(p));

  // Cartera = entregas programadas que aún no han vencido. En este ERP los
  // pedidos no tienen estado "en curso": todo está servido o anulado, así que lo
  // único que representa trabajo pendiente es una fecha de entrega futura.
  const carteraList = pedidos.filter(
    (p) => !esAnulado(p) && Boolean(p.fecha_prometida) && (p.fecha_prometida as string) >= hoy,
  );

  const importeCaptado = pedidos.reduce((s, p) => s + importeDe(p), 0);
  const importeServido = servidosList.reduce((s, p) => s + importeDe(p), 0);
  const importeAnulado = anuladosList.reduce((s, p) => s + importeDe(p), 0);
  const importePendiente = carteraList.reduce((s, p) => s + importeDe(p), 0);
  const importeAbierto = pendientesList.reduce((s, p) => s + importeDe(p), 0);
  const captados = pedidos.length;
  const noAnulados = captados - anuladosList.length;
  const importeNoAnulado = importeCaptado - importeAnulado;

  const ticketMedio = noAnulados > 0 ? importeNoAnulado / noAnulados : 0;

  // Antigüedad de la cartera: días desde la entrada de las entregas programadas.
  const antiguedades = carteraList
    .map((p) => entradaDe(p))
    .filter((f): f is string => Boolean(f))
    .map((f) => Math.max(0, diasEntre(f, hoy)));
  const antiguedadMediaCartera =
    antiguedades.length > 0 ? antiguedades.reduce((s, d) => s + d, 0) / antiguedades.length : 0;

  // Plazo real pedido → factura. Se mide con las fechas que la ingesta copia del
  // pedido a la factura (migración 0046): pedido_fecha y pedido_entrega. Si aún no
  // hay ninguna factura con esos datos, el KPI queda a null (no se inventa).
  const facturasConPedido = await todasLasFilas<FilaFacturaPedido>((offset) => {
    let q = supabase
      .from('facturas')
      .select('fecha, pedido_fecha, pedido_entrega, base_imponible, total')
      .eq('empresa_id', empresa.id)
      .not('pedido_fecha', 'is', null)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    if (filtros?.cliente) q = q.eq('cliente_id', filtros.cliente);
    return q.range(offset, offset + TAMANO_PAGINA - 1);
  });

  const plazos: number[] = [];
  const programadasEnFecha: boolean[] = [];
  let programados = 0;
  let importeProgramado = 0;
  for (const f of facturasConPedido) {
    if (!f.pedido_fecha || !f.fecha) continue;
    const esProgramada = Boolean(f.pedido_entrega && f.pedido_entrega !== f.pedido_fecha);
    if (esProgramada) {
      programados += 1;
      importeProgramado += Number(f.base_imponible ?? f.total ?? 0);
      programadasEnFecha.push(f.fecha <= (f.pedido_entrega as string));
    } else {
      plazos.push(diasEntre(f.pedido_fecha, f.fecha));
    }
  }

  const plazoMedioEntrega =
    plazos.length > 0 ? plazos.reduce((s, d) => s + d, 0) / plazos.length : null;
  const cumplimientoFecha =
    programadasEnFecha.length > 0
      ? (programadasEnFecha.filter(Boolean).length / programadasEnFecha.length) * 100
      : null;

  // Fuera de plazo: pedidos abiertos cuya entrega prevista ya pasó.
  const fueraPlazo: PedidoFueraPlazo[] = [];
  for (const p of pendientesList) {
    const prevista = fechaPrevista(p);
    if (!prevista || prevista >= hoy) continue;
    fueraPlazo.push({
      id: p.id,
      numero: etiquetaPedido(p),
      cliente: p.cliente_nombre ?? '—',
      fechaPrevista: prevista,
      diasRetraso: Math.max(0, diasEntre(prevista, hoy)),
      importe: importeDe(p),
    });
  }
  fueraPlazo.sort((a, b) => b.diasRetraso - a.diasRetraso);

  // Cartera por cliente: pedidos abiertos, importe y antigüedad del más viejo.
  const porCliente = new Map<string, { pedidos: number; pendiente: number; dias: number[]; minima: string | null; proxima: string | null }>();
  for (const p of carteraList) {
    const nombre = p.cliente_nombre ?? 'Cliente desconocido';
    const actual = porCliente.get(nombre) ?? { pedidos: 0, pendiente: 0, dias: [], minima: null, proxima: null };
    actual.pedidos += 1;
    actual.pendiente += importeDe(p);
    const entrada = entradaDe(p);
    if (entrada) {
      actual.dias.push(Math.max(0, diasEntre(entrada, hoy)));
      if (!actual.minima || entrada < actual.minima) actual.minima = entrada;
    }
    const entrega = p.fecha_prometida as string | null;
    if (entrega && (!actual.proxima || entrega < actual.proxima)) actual.proxima = entrega;
    porCliente.set(nombre, actual);
  }
  const carteraCliente: CarteraCliente[] = [...porCliente.entries()]
    .map(([nombre, v]) => ({
      nombre,
      pedidos: v.pedidos,
      pendiente: v.pendiente,
      antiguedadMedia: v.dias.length > 0 ? v.dias.reduce((s, d) => s + d, 0) / v.dias.length : 0,
      entradaMasAntigua: v.minima,
      proximaEntrega: v.proxima,
      diasHastaEntrega: v.proxima ? diasEntre(hoy, v.proxima) : null,
    }))
    .sort((a, b) => (a.proximaEntrega ?? '9999').localeCompare(b.proximaEntrega ?? '9999'));

  // Detalle para los desplegables de "Pedidos por estado".
  function detalleDe(lista: FilaPedido[]): PedidoDetalle[] {
    return [...lista]
      .sort((a, b) => (entradaDe(b) ?? '').localeCompare(entradaDe(a) ?? ''))
      .slice(0, MAX_DETALLE)
      .map((p) => {
        const prevista = fechaPrevista(p);
        const factura = facturaPorPedido.get(p.id) ?? null;
        const abierto = !esAnulado(p) && !esServido(p);
        return {
          id: p.id,
          numero: etiquetaPedido(p),
          cliente: p.cliente_nombre ?? '—',
          fechaEntrada: entradaDe(p),
          fechaPrevista: prevista,
          fechaFactura: factura,
          importe: importeDe(p),
          diasRetraso:
            abierto && prevista && prevista < hoy ? Math.max(0, diasEntre(prevista, hoy)) : null,
        };
      });
  }

  const porEstado: EstadoPedidos[] = [
    { estado: 'pendiente', label: 'Pendiente', pedidos: pendientesList.length, importe: importeAbierto, total: pendientesList.length, detalle: detalleDe(pendientesList) },
    { estado: 'servido', label: 'Servido', pedidos: servidosList.length, importe: importeServido, total: servidosList.length, detalle: detalleDe(servidosList) },
    { estado: 'anulado', label: 'Anulado', pedidos: anuladosList.length, importe: importeAnulado, total: anuladosList.length, detalle: detalleDe(anuladosList) },
  ];

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    anio,
    captados,
    importeCaptado,
    ticketMedio,
    pendientes: pendientesList.length,
    importePendiente,
    servidos: servidosList.length,
    importeServido,
    anulados: anuladosList.length,
    importeAnulado,
    antiguedadMediaCartera,
    plazoMedioEntrega,
    programados,
    importeProgramado,
    cumplimientoFecha,
    fueraPlazo: fueraPlazo.slice(0, MAX_DETALLE),
    fueraPlazoTotal: fueraPlazo.length,
    carteraCliente,
    porEstado,
    sinEnlaceFacturas,
  };
}
