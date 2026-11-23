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
  adjuntos: { nombre: string; url: string | null }[];
  clienteId: string | null;
  clienteNombre: string | null;
  clienteContacto: { persona: string | null; telefono: string | null; email: string | null } | null;
  seguimiento: NotaAgenda[];
};

export type AgendaData = {
  empresaId: string;
  comercialId: string | null;
  esComercial: boolean;
  eventos: EventoAgenda[];
  clientes: { id: string; nombre: string; telefono: string | null; email: string | null; personaContacto: string | null }[];
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

  const clientes = await todasLasFilas<{
    id: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    persona_contacto: string | null;
  }>((desde) =>
    supabase
      .from('clientes')
      .select('id, nombre, telefono, email, persona_contacto')
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
    adjuntos: [],
    clienteContacto: null,
    clienteId: e.cliente_id,
    clienteNombre: e.cliente_id ? (nombreCliente.get(e.cliente_id) ?? '—') : null,
    seguimiento: seguimientoPorEvento.get(e.id) ?? [],
  }));

  return {
    empresaId: empresa.id,
    comercialId: esComercial ? comercialId : null,
    esComercial,
    eventos,
    clientes: clientes.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      email: c.email,
      personaContacto: c.persona_contacto,
    })),
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

  const { data: archivos } = await supabase.storage.from('agenda-adjuntos').list(id, { limit: 100 });
  const adjuntos: { nombre: string; url: string | null }[] = [];
  for (const a of archivos ?? []) {
    if (!a.name) continue;
    const { data: firmada } = await supabase.storage.from('agenda-adjuntos').createSignedUrl(`${id}/${a.name}`, 3600);
    adjuntos.push({ nombre: a.name, url: firmada?.signedUrl ?? null });
  }

  let clienteNombre: string | null = null;
  let clienteContacto: { persona: string | null; telefono: string | null; email: string | null } | null = null;
  if (fila.cliente_id) {
    const { data: c } = await supabase
      .from('clientes')
      .select('nombre, telefono, email, persona_contacto')
      .eq('id', fila.cliente_id)
      .maybeSingle();
    const cf = c as { nombre: string; telefono: string | null; email: string | null; persona_contacto: string | null } | null;
    clienteNombre = cf?.nombre ?? null;
    clienteContacto = cf
      ? { persona: cf.persona_contacto, telefono: cf.telefono, email: cf.email }
      : null;
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
    adjuntos,
    clienteId: fila.cliente_id,
    clienteNombre,
    clienteContacto,
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


export type EventoResumen = {
  id: string;
  fecha: string;
  hora: string | null;
  asunto: string;
  estado: string;
  clienteNombre: string | null;
};

export async function getAgendaResumen(
  codigoEmpresa: string,
): Promise<{
  empresaId: string;
  hoy: EventoResumen[];
  manana: EventoResumen[];
  atrasadas: EventoResumen[];
  proximas: EventoResumen[];
}> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const hoy = new Date().toISOString().slice(0, 10);
  const mananaISO = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const { data: filas } = await supabase
    .from('agenda')
    .select('id, fecha, hora, asunto, estado, cliente_id')
    .eq('empresa_id', empresa.id)
    .neq('estado', 'cancelada')
    .order('fecha', { ascending: true })
    .limit(200);

  const eventos = ((filas ?? []) as {
    id: string;
    fecha: string;
    hora: string | null;
    asunto: string;
    estado: string;
    cliente_id: string | null;
  }[]).filter((e) => e.estado === 'programada');

  const idsClientes = [...new Set(eventos.map((e) => e.cliente_id).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (idsClientes.length) {
    const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', idsClientes);
    for (const c of (clis ?? []) as { id: string; nombre: string }[]) nombres.set(c.id, c.nombre);
  }

  const mapear = (e: (typeof eventos)[number]): EventoResumen => ({
    id: e.id,
    fecha: e.fecha,
    hora: e.hora,
    asunto: e.asunto,
    estado: e.estado,
    clienteNombre: e.cliente_id ? (nombres.get(e.cliente_id) ?? null) : null,
  });

  return {
    empresaId: empresa.id,
    hoy: eventos.filter((e) => e.fecha === hoy).map(mapear),
    manana: eventos.filter((e) => e.fecha === mananaISO).map(mapear),
    atrasadas: eventos.filter((e) => e.fecha < hoy).slice(0, 10).map(mapear),
    proximas: eventos
      .filter((e) => e.fecha > hoy)
      .slice(0, 8)
      .map(mapear),
  };
}
