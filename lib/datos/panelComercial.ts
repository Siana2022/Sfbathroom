import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { calcularCadencia, type Cadencia } from '@/lib/comercial/cadencia';
import { normalizarRango, rangoAnterior, rangoPorDefecto, hoyISO, type RangoFechas } from '@/lib/comercial/periodos';
import { ordenarPorUrgencia, type FilaPanel } from '@/lib/comercial/cartera';
import { normalizarProvincia } from '@/lib/comercial/provincias';
import { ventanaAgenda } from '@/lib/comercial/agenda';
import type { EstadoCrm, Hito, HitoConAutor, ReunionConContexto } from '@/lib/comercial/tipos';

/**
 * Panel de trabajo del comercial (Fase 2).
 *
 * Combina tres cosas en una sola pantalla: cómo va su cartera en el periodo
 * elegido (facturación, altas y bajas), a quién debe llamar (cadencia de pedido
 * por cliente) y qué tiene agendado (reuniones).
 *
 * Todo se lee con la sesión del usuario: el RLS limita filas a su cartera.
 */

export type { RangoFechas };
export { normalizarRango, rangoPorDefecto, rangoAnterior, ordenarPorUrgencia };
export type { FilaPanel };

export type KpisPanel = {
  clientes: number;
  facturacion: number;
  facturacionPrevia: number;
  /** Variación % frente al periodo anterior de igual duración. null si no hay base. */
  variacion: number | null;
  ganados: number;
  perdidos: number;
  vencidos: number;
  /** Reparto de la cartera por estado CRM. */
  estados: {
    habitual: number;
    nuevo: number;
    seguimiento: number;
    ganado: number;
    perdido: number;
    sinEstado: number;
  };
  reunionesProximas: number;
};

export type ReunionAgenda = ReunionConContexto & {
  /** Minutos hasta la reunión (negativo si ya pasó la hora). */
  minutos: number;
};

export type PanelComercial = {
  empresa: { codigo: string; nombre: string };
  rango: RangoFechas;
  kpis: KpisPanel;
  filas: FilaPanel[];
  /** Reuniones próximas (programadas y no vencidas hace rato). */
  agenda: ReunionAgenda[];
  /** Todas las reuniones del alcance del comercial, para el tablero por estado. */
  reuniones: ReunionConContexto[];
  /** Comerciales de la empresa, para el selector de cartera de dirección. */
  comerciales: { id: string; nombre: string }[];
  /** Comercial por el que está acotado el panel, si lo hay. */
  comercialFiltro: string | null;
};

type FilaCliente = {
  id: string;
  nombre: string;
  provincia: string | null;
  pais_facturacion: string | null;
  fecha_primer_pedido: string | null;
  estado_crm: string | null;
  motivo_perdida: string | null;
  contacto_habitual_id: string | null;
};

/**
 * Panel completo del comercial para un rango de fechas.
 *
 * `hoy` se inyecta para poder testear la cadencia sin depender del reloj.
 */
export async function getPanelComercial(
  codigoEmpresa: string,
  rango: RangoFechas,
  hoy: Date = new Date(),
  comercialId?: string | null,
): Promise<PanelComercial> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const previo = rangoAnterior(rango);

  // Dirección puede acotar el panel a la cartera de un comercial concreto.
  // Para un comercial esto llega vacío: su RLS ya limita las filas a lo suyo.
  const filtroComercial = comercialId ?? null;

  let [clientes, contactos, interacciones, comercialesRes, pedidos, facturas, facturasPrevias, reuniones] =
    await Promise.all([
      todasLasFilas<FilaCliente>((desde) => {
        let q = supabase
          .from('clientes')
          .select('id, nombre, provincia, pais_facturacion, fecha_primer_pedido, estado_crm, motivo_perdida, comercial_id, contacto_habitual_id')
          .eq('empresa_id', empresa.id);
        if (filtroComercial) q = q.eq('comercial_id', filtroComercial);
        return q.range(desde, desde + TAMANO_PAGINA - 1);
      }),
      todasLasFilas<{ id: string; cliente_id: string; nombre: string; apellidos: string | null }>((desde) =>
        supabase
          .from('contactos')
          .select('id, cliente_id, nombre, apellidos')
          .eq('empresa_id', empresa.id)
          .eq('activo', true)
          .range(desde, desde + TAMANO_PAGINA - 1),
      ),
      todasLasFilas<{ cliente_id: string; fecha: string }>((desde) =>
        supabase
          .from('interacciones')
          .select('cliente_id, fecha')
          .eq('empresa_id', empresa.id)
          .order('fecha', { ascending: false })
          .range(desde, desde + TAMANO_PAGINA - 1),
      ),
      todasLasFilas<{ id: string; nombre: string }>((desde) =>
        supabase
          .from('comerciales')
          .select('id, nombre')
          .eq('empresa_id', empresa.id)
          .range(desde, desde + TAMANO_PAGINA - 1),
      ),
      // Todos los pedidos del cliente, no solo los del periodo: la cadencia
      // necesita el histórico completo para estimar cada cuánto pide.
      todasLasFilas<{ cliente_id: string | null; fecha: string; importe: number | null }>((desde) =>
        supabase
          .from('pedidos')
          .select('cliente_id, fecha, importe')
          .eq('empresa_id', empresa.id)
          .range(desde, desde + TAMANO_PAGINA - 1),
      ),
      todasLasFilas<{ cliente_id: string | null; fecha: string; base_imponible: number | null }>((desde) =>
        supabase
          .from('facturas')
          .select('cliente_id, fecha, base_imponible')
          .eq('empresa_id', empresa.id)
          .gte('fecha', rango.desde)
          .lte('fecha', rango.hasta)
          .range(desde, desde + TAMANO_PAGINA - 1),
      ),
      todasLasFilas<{ cliente_id: string | null; base_imponible: number | null }>((desde) =>
        supabase
          .from('facturas')
          .select('cliente_id, base_imponible')
          .eq('empresa_id', empresa.id)
          .gte('fecha', previo.desde)
          .lte('fecha', previo.hasta)
          .range(desde, desde + TAMANO_PAGINA - 1),
      ),
      todasLasFilas<{
        id: string;
        cliente_id: string;
        contacto_id: string | null;
        contacto_nombre: string | null;
        comercial_id: string | null;
        usuario_id: string | null;
        fecha_hora: string;
        duracion_min: number | null;
        asunto: string | null;
        modalidad: string | null;
        modalidad_otro: string | null;
        estado: string;
        notas: string | null;
        interaccion_id: string | null;
        created_at: string;
      }>((desde) =>
        supabase
          .from('reuniones')
          .select(
            'id, cliente_id, contacto_id, contacto_nombre, comercial_id, usuario_id, fecha_hora, duracion_min, asunto, modalidad, modalidad_otro, estado, notas, interaccion_id, created_at',
          )
          .eq('empresa_id', empresa.id)
          // Ventana acotada: todo el futuro más los últimos meses. Sin esto el
          // tablero acabaría cargando años de reuniones cerradas que nadie mira.
          .gte('fecha_hora', ventanaAgenda(hoy))
          .order('fecha_hora')
          .range(desde, desde + TAMANO_PAGINA - 1),
      ),
    ]);

  // Acotar al comercial elegido. Se filtra aquí y no en cada consulta porque la
  // cartera se define por `clientes.comercial_id`: así el panel entero (KPIs,
  // agenda y seguimiento) habla de la misma cartera, sin depender de que
  // `facturas.comercial_id` esté relleno en todas las filas.
  if (filtroComercial) {
    const cartera = new Set(clientes.map((c) => c.id));
    const enCartera = <T extends { cliente_id: string | null }>(filas: T[]) =>
      filas.filter((f) => f.cliente_id !== null && cartera.has(f.cliente_id));
    contactos = contactos.filter((f) => cartera.has(f.cliente_id));
    interacciones = interacciones.filter((f) => cartera.has(f.cliente_id));
    pedidos = enCartera(pedidos);
    facturas = enCartera(facturas);
    facturasPrevias = enCartera(facturasPrevias);
    reuniones = reuniones.filter((f) => cartera.has(f.cliente_id));
  }

  // --- Índices por cliente ---
  // Solo interesa la persona marcada como habitual en la ficha, asi que se
  // indexa por id y se busca al construir la fila.
  const contactoPorId = new Map(contactos.map((c) => [c.id, c]));
  const nombreContacto = (id: string | null): string | null => {
    const c = id ? contactoPorId.get(id) : null;
    return c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : null;
  };

  const interaccionPorCliente = new Map<string, { n: number; ultima: string }>();
  for (const i of interacciones) {
    const prev = interaccionPorCliente.get(i.cliente_id);
    if (prev) {
      prev.n += 1;
      if (i.fecha > prev.ultima) prev.ultima = i.fecha;
    } else {
      interaccionPorCliente.set(i.cliente_id, { n: 1, ultima: i.fecha });
    }
  }

  const pedidosPorCliente = new Map<string, string[]>();
  for (const p of pedidos) {
    if (!p.cliente_id) continue;
    const lista = pedidosPorCliente.get(p.cliente_id);
    if (lista) lista.push(p.fecha);
    else pedidosPorCliente.set(p.cliente_id, [p.fecha]);
  }

  // Importe y nº de pedidos dentro del periodo elegido.
  const pedidosPeriodo = new Map<string, { n: number; importe: number }>();
  for (const p of pedidos) {
    if (!p.cliente_id || p.fecha < rango.desde || p.fecha > rango.hasta) continue;
    const prev = pedidosPeriodo.get(p.cliente_id);
    if (prev) {
      prev.n += 1;
      prev.importe += Number(p.importe ?? 0);
    } else {
      pedidosPeriodo.set(p.cliente_id, { n: 1, importe: Number(p.importe ?? 0) });
    }
  }

  const facturadoPorCliente = new Map<string, number>();
  for (const f of facturas) {
    if (!f.cliente_id) continue;
    facturadoPorCliente.set(f.cliente_id, (facturadoPorCliente.get(f.cliente_id) ?? 0) + Number(f.base_imponible ?? 0));
  }

  const facturadoPrevio = new Map<string, number>();
  for (const f of facturasPrevias) {
    if (!f.cliente_id) continue;
    facturadoPrevio.set(f.cliente_id, (facturadoPrevio.get(f.cliente_id) ?? 0) + Number(f.base_imponible ?? 0));
  }

  // --- Filas de cartera con cadencia ---
  const inicio = Date.parse(rango.desde);
  const fin = Date.parse(rango.hasta);
  const UMBRAL_PERDIDO = 90;

  const filas: FilaPanel[] = clientes.map((c) => {
    const fechas = pedidosPorCliente.get(c.id) ?? [];
    const cad: Cadencia = calcularCadencia(fechas, hoy);
    const per = pedidosPeriodo.get(c.id);
    const inter = interaccionPorCliente.get(c.id);

    // Ganado: su primer pedido cae dentro del periodo.
    // Perdido: pedía antes, no ha pedido en el periodo y lleva más de 90 días
    // sin hacerlo (regla de la especificación, punto 0.2). El umbral evita
    // marcar como perdido a quien pidió la semana pasada.
    const t = fechas.map((x) => Date.parse(x)).filter((x) => !Number.isNaN(x));
    let estadoComercial: FilaPanel['estadoComercial'] = null;
    if (t.length > 0) {
      const primero = Math.min(...t);
      const enPeriodo = t.some((x) => x >= inicio && x <= fin);
      if (primero >= inicio && primero <= fin) estadoComercial = 'ganado';
      else if (!enPeriodo && cad.diasSinPedir !== null && cad.diasSinPedir > UMBRAL_PERDIDO) estadoComercial = 'perdido';
    }

    return {
      cliente_id: c.id,
      cliente: c.nombre,
      provincia: normalizarProvincia(c.provincia),
      pais: c.pais_facturacion,
      cadenciaDias: cad.dias,
      cadenciaTexto: cad.dias === null ? (cad.pedidos === 1 ? '1 pedido' : 'sin histórico') : `${Math.round(cad.dias)} d`,
      diasSinPedir: cad.diasSinPedir,
      ratio: cad.ratio,
      vencido: cad.vencido,
      pedidosPeriodo: per?.n ?? 0,
      importePeriodo: per?.importe ?? 0,
      contactoHabitual: nombreContacto(c.contacto_habitual_id),
      ultimaInteraccion: inter?.ultima ?? null,
      estadoComercial,
      estadoCrm: (c.estado_crm as FilaPanel['estadoCrm']) ?? null,
      motivoPerdida: c.motivo_perdida,
    };
  });

  const ganados = filas.filter((f) => f.estadoComercial === 'ganado').length;
  const perdidos = filas.filter((f) => f.estadoComercial === 'perdido').length;

  // --- Agenda: próximas reuniones programadas ---
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  const comercialNombre = new Map(comercialesRes.map((c) => [c.id, c.nombre]));
  const contactoNombre = new Map<string, string>();
  for (const c of await todasLasFilas<{ id: string; nombre: string; apellidos: string | null }>((desde) =>
    supabase
      .from('contactos')
      .select('id, nombre, apellidos')
      .eq('empresa_id', empresa.id)
      .range(desde, desde + TAMANO_PAGINA - 1),
  )) {
    contactoNombre.set(c.id, [c.nombre, c.apellidos].filter(Boolean).join(' '));
  }

  const ahora = hoy.getTime();

  // Todas las reuniones con contexto: alimentan el tablero por estado.
  const todasReuniones: ReunionConContexto[] = reuniones.map((r) => ({
    id: r.id,
    cliente_id: r.cliente_id,
    contacto_id: r.contacto_id,
    contacto_nombre: r.contacto_nombre ?? null,
    comercial_id: r.comercial_id,
    usuario_id: r.usuario_id,
    fecha_hora: r.fecha_hora,
    duracion_min: r.duracion_min,
    asunto: r.asunto,
    modalidad: (r.modalidad as ReunionConContexto['modalidad']) ?? null,
    modalidad_otro: r.modalidad_otro ?? null,
    estado: r.estado as ReunionConContexto['estado'],
    notas: r.notas,
    interaccion_id: r.interaccion_id,
    created_at: r.created_at,
    cliente: nombreCliente.get(r.cliente_id) ?? '—',
    // El contacto dado de alta manda; si no lo hay, se enseña el nombre escrito
    // a mano al agendar.
    contacto: (r.contacto_id ? contactoNombre.get(r.contacto_id) ?? null : null) ?? r.contacto_nombre ?? null,
    comercial: r.comercial_id ? comercialNombre.get(r.comercial_id) ?? null : null,
  }));

  // Reuniones próximas para el resumen de KPIs y el aviso de "lo siguiente".
  const agenda: ReunionAgenda[] = todasReuniones
    .filter((r) => r.estado === 'programada')
    .map((r) => ({ ...r, minutos: Math.round((Date.parse(r.fecha_hora) - ahora) / 60000) }))
    .filter((r) => r.minutos >= -60) // una reunión recién pasada sigue visible un rato
    .slice(0, 20);

  const facturacion = facturas.reduce((s, f) => s + Number(f.base_imponible ?? 0), 0);
  const facturacionPrevia = facturasPrevias.reduce((s, f) => s + Number(f.base_imponible ?? 0), 0);

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    rango,
    kpis: {
      clientes: filas.length,
      facturacion,
      facturacionPrevia,
      variacion: facturacionPrevia > 0 ? ((facturacion - facturacionPrevia) / facturacionPrevia) * 100 : null,
      ganados,
      perdidos,
      vencidos: filas.filter((f) => f.vencido).length,
      estados: {
        habitual: filas.filter((f) => f.estadoCrm === 'habitual').length,
        nuevo: filas.filter((f) => f.estadoCrm === 'nuevo').length,
        seguimiento: filas.filter((f) => f.estadoCrm === 'seguimiento').length,
        ganado: filas.filter((f) => f.estadoCrm === 'ganado').length,
        perdido: filas.filter((f) => f.estadoCrm === 'perdido').length,
        sinEstado: filas.filter((f) => !f.estadoCrm).length,
      },
      reunionesProximas: agenda.length,
    },
    filas,
    agenda,
    reuniones: todasReuniones,
    comerciales: comercialesRes
      .map((c) => ({ id: c.id, nombre: c.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    comercialFiltro: filtroComercial,
  };
}

/** Reuniones de un cliente, para la ficha. */
export async function getReunionesCliente(codigoEmpresa: string, clienteId: string): Promise<ReunionConContexto[]> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const [{ data }, { data: cli }, contactos] = await Promise.all([
    supabase
      .from('reuniones')
      .select(
        'id, cliente_id, contacto_id, contacto_nombre, comercial_id, usuario_id, fecha_hora, duracion_min, asunto, modalidad, modalidad_otro, estado, notas, interaccion_id, created_at',
      )
      .eq('empresa_id', empresa.id)
      .eq('cliente_id', clienteId)
      .order('fecha_hora', { ascending: false }),
    supabase.from('clientes').select('nombre').eq('id', clienteId).maybeSingle(),
    todasLasFilas<{ id: string; nombre: string; apellidos: string | null }>((desde) =>
      supabase
        .from('contactos')
        .select('id, nombre, apellidos')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
  ]);

  const nombreContacto = new Map(contactos.map((c) => [c.id, [c.nombre, c.apellidos].filter(Boolean).join(' ')]));
  const nombreCliente = (cli as { nombre: string } | null)?.nombre ?? '';

  return ((data ?? []) as ReunionConContexto[]).map((r) => ({
    ...r,
    cliente: nombreCliente,
    contacto: (r.contacto_id ? nombreContacto.get(r.contacto_id) ?? null : null) ?? r.contacto_nombre ?? null,
    comercial: null,
  }));
}

/**
 * Hitos de un cliente: acuerdos, cambios de responsable, altas en programas.
 *
 * Ordenados del más reciente al más antiguo, que es como se leen: lo último
 * que pasó es lo que hay que tener presente antes de una llamada.
 */
export async function getHitosCliente(codigoEmpresa: string, clienteId: string): Promise<HitoConAutor[]> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data } = await supabase
    .from('hitos')
    .select('id, cliente_id, comercial_id, usuario_id, fecha, titulo, detalle, created_at')
    .eq('empresa_id', empresa.id)
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  const hitos = (data ?? []) as Hito[];
  if (hitos.length === 0) return [];

  const comerciales = await todasLasFilas<{ id: string; nombre: string }>((desde) =>
    supabase
      .from('comerciales')
      .select('id, nombre')
      .eq('empresa_id', empresa.id)
      .range(desde, desde + TAMANO_PAGINA - 1),
  );
  const porId = new Map(comerciales.map((c) => [c.id, c.nombre]));

  return hitos.map((h) => ({ ...h, autor: h.comercial_id ? porId.get(h.comercial_id) ?? null : null }));
}

/** Una reunión ya cerrada, tal como se revisa en la pestaña de seguimiento. */
export type ReunionSeguimiento = ReunionConContexto & {
  /** Cliente al que pertenece, para el desplegable de estado. */
  estadoCrm: EstadoCrm | null;
  motivoPerdida: string | null;
};

/**
 * Reuniones cerradas (realizadas o canceladas) dentro de la ventana de la
 * agenda, para revisarlas una a una y fijar el estado del cliente.
 *
 * Solo las que aún no se han volcado al histórico o las recientes: la idea es
 * que sea una bandeja de trabajo, no un archivo muerto.
 */
export async function getSeguimiento(codigoEmpresa: string, desdeISO: string): Promise<ReunionSeguimiento[]> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data } = await supabase
    .from('reuniones')
    .select(
      'id, cliente_id, contacto_id, contacto_nombre, comercial_id, usuario_id, fecha_hora, duracion_min, asunto, modalidad, modalidad_otro, estado, notas, interaccion_id, created_at',
    )
    .eq('empresa_id', empresa.id)
    .neq('estado', 'programada')
    .gte('fecha_hora', desdeISO)
    .order('fecha_hora', { ascending: false });

  const reuniones = (data ?? []) as ReunionConContexto[];
  if (reuniones.length === 0) return [];

  const idsCliente = [...new Set(reuniones.map((r) => r.cliente_id))];
  const clientes = await todasLasFilas<{ id: string; nombre: string; estado_crm: string | null; motivo_perdida: string | null }>(
    (desde) =>
      supabase
        .from('clientes')
        .select('id, nombre, estado_crm, motivo_perdida')
        .eq('empresa_id', empresa.id)
        .in('id', idsCliente)
        .range(desde, desde + TAMANO_PAGINA - 1),
  );
  const porCliente = new Map(clientes.map((c) => [c.id, c]));

  return reuniones.map((r) => {
    const c = porCliente.get(r.cliente_id);
    return {
      ...r,
      cliente: c?.nombre ?? '—',
      estadoCrm: (c?.estado_crm as EstadoCrm | null) ?? null,
      motivoPerdida: c?.motivo_perdida ?? null,
    };
  });
}

