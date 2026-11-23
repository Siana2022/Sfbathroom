import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { getUsuario } from '@/lib/datos/role';

export type NotaAgenda = { id: string; texto: string; fecha: string; tipo: string; motivo: string | null };

export type EventoAgenda = {
  id: string;
  fecha: string;
  hora: string | null;
  asunto: string;
  tipo: string;
  notas: string | null;
  completada: boolean;
  estado: string;
  importeEstimado: number | null;
  pedidoRef: string | null;
  motivoCierre: string | null;
  proximaReunionId: string | null;
  pedido: { id: string; numero: string | null; importe: number } | null;
  clienteId: string | null;
  clienteNombre: string | null;
  seguimiento: NotaAgenda[];
};

export type AgendaData = {
  empresaId: string;
  comercialId: string | null;
  esComercial: boolean;
  eventos: EventoAgenda[];
  clientes: { id: string; nombre: string }[];
};

export async function getAgendaContexto(
  codigoEmpresa: string,
): Promise<{ empresaId: string; comercialId: string | null; esComercial: boolean }> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const usuario = await getUsuario();
  let comercialId: string | null = null;
  let esComercial = false;
  if (usuario) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role, comercial_id')
      .eq('id', usuario.id)
      .maybeSingle();
    esComercial = perfil?.role === 'comercial';
    comercialId = (perfil?.comercial_id as string | null) ?? null;
  }
  return { empresaId: empresa.id, comercialId, esComercial };
}

export async function getAgenda(codigoEmpresa: string): Promise<AgendaData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const usuario = await getUsuario();

  let comercialId: string | null = null;
  let esComercial = false;
  if (usuario) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role, comercial_id')
      .eq('id', usuario.id)
      .maybeSingle();
    esComercial = perfil?.role === 'comercial';
    comercialId = (perfil?.comercial_id as string | null) ?? null;
  }

  const { data: notasRaw } = await supabase
    .from('agenda_notas')
    .select('id, agenda_id, texto, created_at, tipo, motivo')
    .eq('empresa_id', empresa.id)
    .order('created_at', { ascending: true });

  const seguimientoPorEvento = new Map<string, NotaAgenda[]>();
  for (const n of (notasRaw ?? []) as {
    id: string;
    agenda_id: string;
    texto: string;
    created_at: string;
    tipo: string;
    motivo: string | null;
  }[]) {
    const arr = seguimientoPorEvento.get(n.agenda_id) ?? [];
    arr.push({ id: n.id, texto: n.texto, fecha: n.created_at, tipo: n.tipo, motivo: n.motivo });
    seguimientoPorEvento.set(n.agenda_id, arr);
  }

  const { data: eventosRaw } = await supabase
    .from('agenda')
    .select('id, comercial_id, cliente_id, fecha, hora, asunto, tipo, notas, completada, estado, importe_estimado, pedido_ref, motivo_cierre, proxima_reunion_id')
    .eq('empresa_id', empresa.id)
    .order('fecha', { ascending: true });

  const clientes = await todasLasFilas<{ id: string; nombre: string }>((desde) =>
    supabase
      .from('clientes')
      .select('id, nombre')
      .eq('empresa_id', empresa.id)
      .order('nombre')
      .range(desde, desde + TAMANO_PAGINA - 1),
  );
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));

  const eventos: EventoAgenda[] = ((eventosRaw ?? []) as {
    id: string;
    cliente_id: string | null;
    fecha: string;
    hora: string | null;
    asunto: string;
    tipo: string;
    notas: string | null;
    completada: boolean;
    estado: string;
    importe_estimado: number | null;
    pedido_ref: string | null;
    motivo_cierre: string | null;
    proxima_reunion_id: string | null;
  }[]).map((e) => ({
    id: e.id,
    fecha: e.fecha,
    hora: e.hora,
    asunto: e.asunto,
    tipo: e.tipo,
    notas: e.notas,
    completada: e.completada,
    estado: e.estado ?? 'programada',
    importeEstimado: e.importe_estimado === null ? null : Number(e.importe_estimado),
    pedidoRef: e.pedido_ref,
    motivoCierre: e.motivo_cierre,
    proximaReunionId: e.proxima_reunion_id,
    pedido: null,
    clienteId: e.cliente_id,
    clienteNombre: e.cliente_id ? (nombreCliente.get(e.cliente_id) ?? '—') : null,
    seguimiento: seguimientoPorEvento.get(e.id) ?? [],
  }));

  return {
    empresaId: empresa.id,
    comercialId: esComercial ? comercialId : null,
    esComercial,
    eventos,
    clientes: clientes.map((c) => ({ id: c.id, nombre: c.nombre })),
  };
}


export async function getEventoAgenda(id: string): Promise<EventoAgenda | null> {
  const supabase = createClient();
  const { data: e } = await supabase
    .from('agenda')
    .select('id, cliente_id, fecha, hora, asunto, tipo, notas, completada, estado, importe_estimado, pedido_ref, pedido_id, motivo_cierre, proxima_reunion_id')
    .eq('id', id)
    .maybeSingle();
  if (!e) return null;

  const fila = e as {
    id: string;
    cliente_id: string | null;
    fecha: string;
    hora: string | null;
    asunto: string;
    tipo: string;
    notas: string | null;
    completada: boolean;
    estado: string;
    importe_estimado: number | null;
    pedido_ref: string | null;
    pedido_id: string | null;
    motivo_cierre: string | null;
    proxima_reunion_id: string | null;
  };

  let pedido: { id: string; numero: string | null; importe: number } | null = null;
  if (fila.pedido_id) {
    const { data: p } = await supabase
      .from('pedidos')
      .select('id, numero_erp, importe')
      .eq('id', fila.pedido_id)
      .maybeSingle();
    const pf = p as { id: string; numero_erp: string | null; importe: number } | null;
    if (pf) pedido = { id: pf.id, numero: pf.numero_erp, importe: Number(pf.importe ?? 0) };
  }

  let clienteNombre: string | null = null;
  if (fila.cliente_id) {
    const { data: c } = await supabase.from('clientes').select('nombre').eq('id', fila.cliente_id).maybeSingle();
    clienteNombre = (c as { nombre: string } | null)?.nombre ?? null;
  }

  const { data: notasRaw } = await supabase
    .from('agenda_notas')
    .select('id, texto, created_at, tipo, motivo')
    .eq('agenda_id', id)
    .order('created_at', { ascending: true });

  return {
    id: fila.id,
    fecha: fila.fecha,
    hora: fila.hora,
    asunto: fila.asunto,
    tipo: fila.tipo,
    notas: fila.notas,
    completada: fila.completada,
    estado: fila.estado ?? 'programada',
    importeEstimado: fila.importe_estimado === null ? null : Number(fila.importe_estimado),
    pedidoRef: fila.pedido_ref,
    motivoCierre: fila.motivo_cierre,
    proximaReunionId: fila.proxima_reunion_id,
    pedido,
    clienteId: fila.cliente_id,
    clienteNombre,
    seguimiento: ((notasRaw ?? []) as {
      id: string;
      texto: string;
      created_at: string;
      tipo: string;
      motivo: string | null;
    }[]).map((n) => ({
      id: n.id,
      texto: n.texto,
      fecha: n.created_at,
      tipo: n.tipo,
      motivo: n.motivo,
    })),
  };
}
