import { createClient } from '@/lib/supabase/server';

export type EventoSeguimiento =
  | { tipo: 'nota'; id: string; fecha: string; texto: string; autor: string | null }
  | { tipo: 'reunion'; id: string; fecha: string; titulo: string; estado: string | null; contacto: string | null }
  | { tipo: 'cambio'; id: string; fecha: string; texto: string; motivo: string | null }
  | { tipo: 'alta'; id: string; fecha: string; texto: string }
  | {
      tipo: 'interaccion';
      id: string;
      fecha: string;
      subtipo: string;
      titulo: string | null;
      detalle: string | null;
      resultado: string | null;
      duracionMin: number | null;
      origen: string | null;
    };

export type AlertaCliente = {
  id: string;
  titulo: string;
  nota: string | null;
  recordarHasta: string | null;
  resuelta: boolean;
  createdAt: string;
};

export async function getSeguimientoCliente(clienteId: string): Promise<{
  eventos: EventoSeguimiento[];
  alertas: AlertaCliente[];
}> {
  const supabase = createClient();

  const [notasRes, agendaRes, alertasRes, interaccionesRes] = await Promise.all([
    supabase
      .from('clientes_notas')
      .select('id, texto, created_at, autor_id')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('agenda')
      .select('id, fecha, asunto, estado, contacto_nombre')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .limit(30),
    supabase
      .from('clientes_alertas')
      .select('id, titulo, nota, recordar_hasta, resuelta, created_at')
      .eq('cliente_id', clienteId)
      .order('resuelta')
      .order('created_at', { ascending: false }),
    // Llamadas, notas y correos importados (Zoho y futuras fuentes).
    supabase
      .from('interacciones')
      .select('id, tipo, fecha, asunto, contenido, resultado, duracion_min, origen')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .limit(60),
  ]);

  const notas = (notasRes.data ?? []) as { id: string; texto: string; created_at: string; autor_id: string | null }[];
  const reuniones = (agendaRes.data ?? []) as {
    id: string;
    fecha: string;
    asunto: string;
    estado: string | null;
    contacto_nombre: string | null;
  }[];

  const idsReunion = reuniones.map((r) => r.id);
  const cambiosRes = idsReunion.length
    ? await supabase
        .from('agenda_cambios')
        .select('id, agenda_id, fecha_anterior, fecha_nueva, motivo, created_at')
        .in('agenda_id', idsReunion)
        .order('created_at', { ascending: false })
        .limit(30)
    : { data: [] as { id: string; agenda_id: string; fecha_anterior: string | null; fecha_nueva: string | null; motivo: string | null; created_at: string }[] };

  const interacciones = (interaccionesRes.data ?? []) as {
    id: string;
    tipo: string;
    fecha: string;
    asunto: string | null;
    contenido: string | null;
    resultado: string | null;
    duracion_min: number | null;
    origen: string | null;
  }[];

  const eventos: EventoSeguimiento[] = [
    ...notas.map((n) => ({ tipo: 'nota' as const, id: n.id, fecha: n.created_at, texto: n.texto, autor: null })),
    ...interacciones.map((i) => ({
      tipo: 'interaccion' as const,
      id: i.id,
      fecha: i.fecha,
      subtipo: i.tipo,
      titulo: i.asunto,
      detalle: i.contenido,
      resultado: i.resultado,
      duracionMin: i.duracion_min,
      origen: i.origen,
    })),
    ...reuniones.map((r) => ({
      tipo: 'reunion' as const,
      id: r.id,
      fecha: `${r.fecha}T00:00:00`,
      titulo: r.asunto,
      estado: r.estado,
      contacto: r.contacto_nombre,
    })),
    ...((cambiosRes.data ?? []) as {
      id: string;
      agenda_id: string;
      fecha_anterior: string | null;
      fecha_nueva: string | null;
      motivo: string | null;
      created_at: string;
    }[]).map((c) => ({
      tipo: 'cambio' as const,
      id: c.id,
      fecha: c.created_at,
      texto: `Reunión reprogramada${c.fecha_anterior ? ` de ${c.fecha_anterior}` : ''}${c.fecha_nueva ? ` a ${c.fecha_nueva}` : ''}`,
      motivo: c.motivo,
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const alertas = ((alertasRes.data ?? []) as {
    id: string;
    titulo: string;
    nota: string | null;
    recordar_hasta: string | null;
    resuelta: boolean;
    created_at: string;
  }[]).map((a) => ({
    id: a.id,
    titulo: a.titulo,
    nota: a.nota,
    recordarHasta: a.recordar_hasta,
    resuelta: a.resuelta,
    createdAt: a.created_at,
  }));

  return { eventos, alertas };
}
