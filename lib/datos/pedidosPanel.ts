import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { EMPRESAS } from '@/lib/empresas';

export type LineaPedido = { descripcion: string; codigo: string | null; cantidad: number };

export type PedidoOperativo = {
  id: string;
  empresaId: string;
  numero: string;
  cliente: string;
  fecha: string;
  fechaPrometida: string | null;
  diasRetraso: number | null;
  importe: number;
  lineas: LineaPedido[];
  observacion: string | null;
  /** Solo en la vista fusionada. */
  empresa?: string;
};

export type PedidosPanel = {
  empresa: { codigo: string; nombre: string };
  anio: number;
  pendientes: PedidoOperativo[];
  programados: PedidoOperativo[];
  fueraPlazo: PedidoOperativo[];
  importePendiente: number;
  importeProgramado: number;
  importeFueraPlazo: number;
};

const DIA = 86400000;

type Fila = {
  id: string;
  numero_erp: string | null;
  serie: string | null;
  fecha: string | null;
  fecha_entrada: string | null;
  fecha_prometida: string | null;
  importe: number | null;
  estado: string | null;
  situacion: string | null;
  situacion_detalle: string | null;
  cliente_nombre: string | null;
  clientes: { nombre: string }[] | null;
  pedido_lineas: { descripcion: string | null; codigo_articulo: string | null; cantidad: number | null }[] | null;
};

function numero(f: Fila): string {
  if (!f.numero_erp) return '—';
  return f.serie ? `${f.serie}/${f.numero_erp}` : f.numero_erp;
}

/**
 * Pedidos pendientes de servir, con sus líneas y la última observación.
 * Es la vista operativa: qué hay pendiente, qué tiene fecha y qué va tarde.
 */
async function cargarPanel(codigoEmpresa: string, anio: number): Promise<PedidosPanel> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const hoyISO = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from('pedidos')
    .select(
      'id, numero_erp, serie, fecha, fecha_entrada, fecha_prometida, importe, estado, situacion, situacion_detalle, cliente_nombre, clientes(nombre), pedido_lineas(descripcion, codigo_articulo, cantidad)',
    )
    .eq('empresa_id', empresa.id)
    .order('fecha_entrada', { ascending: true });

  // Abierto = SITUACIONDETALLE empieza por PENDIENTE (o estado ya normalizado).
  // Se admite también el estado antiguo `captado` de las filas sin recargar.
  const filas = ((data ?? []) as Fila[]).filter((f) => {
    const detalle = (f.situacion_detalle ?? '').toUpperCase();
    if (detalle) {
      if (detalle.startsWith('PENDIENTE')) return true;
      if (detalle.startsWith('SERVIDO') || detalle.startsWith('ANULADO')) return false;
    }
    return f.estado === 'pendiente' || f.estado === 'captado';
  });

  // Última observación por pedido (la tabla es pequeña: se trae entera y se filtra).
  const { data: obs } = await supabase
    .from('pedidos_observaciones')
    .select('pedido_id, texto, created_at')
    .eq('empresa_id', empresa.id)
    .order('created_at', { ascending: false });
  const observacion = new Map<string, string>();
  for (const o of (obs ?? []) as { pedido_id: string; texto: string }[]) {
    if (!observacion.has(o.pedido_id)) observacion.set(o.pedido_id, o.texto);
  }

  const pedidos: PedidoOperativo[] = filas.map((f) => {
    const fecha = f.fecha_entrada ?? f.fecha ?? '';
    const diasRetraso =
      f.fecha_prometida && f.fecha_prometida < hoyISO
        ? Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${f.fecha_prometida}T00:00:00Z`)) / DIA)
        : null;
    return {
      id: f.id,
      empresaId: empresa.id,
      numero: numero(f),
      cliente: f.clientes?.[0]?.nombre ?? f.cliente_nombre ?? '—',
      fecha,
      fechaPrometida: f.fecha_prometida,
      diasRetraso,
      importe: Number(f.importe ?? 0),
      lineas: (f.pedido_lineas ?? []).map((l) => ({
        descripcion: l.descripcion ?? '',
        codigo: l.codigo_articulo,
        cantidad: Number(l.cantidad ?? 0),
      })),
      observacion: observacion.get(f.id) ?? null,
    };
  });

  // Listas disjuntas: sin fecha (por planificar) y con fecha (planificados).
  const pendientesSinFecha = pedidos.filter((p) => !p.fechaPrometida);
  const programados = pedidos
    .filter((p) => p.fechaPrometida)
    .sort((a, b) => (a.fechaPrometida ?? '').localeCompare(b.fechaPrometida ?? ''));
  const fueraPlazo = pedidos
    .filter((p) => p.diasRetraso !== null)
    .sort((a, b) => (b.diasRetraso ?? 0) - (a.diasRetraso ?? 0));

  const suma = (lista: PedidoOperativo[]) => lista.reduce((s, p) => s + p.importe, 0);

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    anio,
    pendientes: pendientesSinFecha,
    programados,
    fueraPlazo,
    importePendiente: suma(pedidos),
    importeProgramado: suma(programados),
    importeFueraPlazo: suma(fueraPlazo),
  };
}

export async function getPedidosPanel(codigoEmpresa: string, anio: number): Promise<PedidosPanel> {
  return cargarPanel(codigoEmpresa, anio);
}

/** Vista fusionada de las tres empresas para el comercial. */
export async function getPedidosPanelFusionado(anio: number): Promise<PedidosPanel> {
  const partes = await Promise.all(EMPRESAS.map((e) => cargarPanel(e.codigo, anio)));
  const conEmpresa = (lista: PedidoOperativo[], codigo: string) => lista.map((p) => ({ ...p, empresa: codigo }));

  return {
    empresa: { codigo: 'TODAS', nombre: 'las tres empresas' },
    anio,
    pendientes: partes.flatMap((p) => conEmpresa(p.pendientes, p.empresa.codigo)),
    programados: partes.flatMap((p) => conEmpresa(p.programados, p.empresa.codigo)),
    fueraPlazo: partes.flatMap((p) => conEmpresa(p.fueraPlazo, p.empresa.codigo)),
    importePendiente: partes.reduce((s, p) => s + p.importePendiente, 0),
    importeProgramado: partes.reduce((s, p) => s + p.importeProgramado, 0),
    importeFueraPlazo: partes.reduce((s, p) => s + p.importeFueraPlazo, 0),
  };
}
