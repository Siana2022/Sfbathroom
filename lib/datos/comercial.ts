import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { callLLM } from '@/lib/agente/llm';
import type { Contacto, EstadoCrm, Hito, HitoConAutor, Interaccion, TipoInteraccion } from '@/lib/comercial/tipos';
import { normalizarProvincia } from '@/lib/comercial/provincias';

export type { Contacto, Interaccion, TipoInteraccion };
export { TIPOS_INTERACCION, RESULTADOS_INTERACCION, ETIQUETA_TIPO } from '@/lib/comercial/tipos';

/**
 * Módulo "Acceso comercial" (Fase 1).
 *
 * Todo se lee con la sesión del usuario: el RLS de `contactos` e `interacciones`
 * ya limita las filas a la cartera del comercial, así que aquí no se filtra por
 * comercial_id en las consultas salvo para el ámbito por defecto del listado.
 */

const DIA = 86400000;

export const ROLES_VEN_TODO = ['admin', 'direccion', 'financiero', 'lectura', 'administracion', 'almacen'];

export type ContextoComercial = {
  userId: string;
  rol: string | null;
  comercialId: string | null;
  comercialNombre: string | null;
  esComercial: boolean;
  puedeVerTodo: boolean;
  puedeEscribir: boolean;
};


export type FilaCartera = {
  cliente_id: string;
  cliente: string;
  codigoErp: string | null;
  provincia: string | null;
  pais: string | null;
  comercial: string | null;
  contactos: number;
  ultimoPedido: string | null;
  diasSinPedir: number | null;
  pedidos12m: number;
  importe12m: number;
  ultimaInteraccion: string | null;
  interacciones: number;
};

export type CarteraComercial = {
  empresa: { codigo: string; nombre: string };
  contexto: ContextoComercial;
  filas: FilaCartera[];
  totales: { clientes: number; conContacto: number; sinPedir60: number; sinInteraccion: number };
};

/** Perfil y ámbito del usuario actual. */
export async function getContextoComercial(): Promise<ContextoComercial> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { userId: '', rol: null, comercialId: null, comercialNombre: null, esComercial: false, puedeVerTodo: false, puedeEscribir: false };
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, comercial_id')
    .eq('id', user.id)
    .maybeSingle();

  const rol = (perfil?.role as string | null) ?? null;
  const comercialId = (perfil?.comercial_id as string | null) ?? null;

  let comercialNombre: string | null = null;
  if (comercialId) {
    const { data: com } = await supabase.from('comerciales').select('nombre').eq('id', comercialId).maybeSingle();
    comercialNombre = (com?.nombre as string | null) ?? null;
  }

  const puedeVerTodo = rol !== null && ROLES_VEN_TODO.includes(rol);
  return {
    userId: user.id,
    rol,
    comercialId,
    comercialNombre,
    esComercial: rol === 'comercial',
    puedeVerTodo,
    puedeEscribir: puedeVerTodo || rol === 'comercial',
  };
}

type FilaClienteBase = {
  id: string;
  nombre: string;
  codigo_erp: string | null;
  provincia: string | null;
  pais_facturacion: string | null;
  comercial_id: string | null;
  estado: string | null;
};

type FilaContactoMin = { cliente_id: string };
type FilaPedidoMin = { cliente_id: string | null; fecha: string; importe: number | null };
type FilaInteraccionMin = { cliente_id: string; fecha: string };

/**
 * Listado de cartera para el comercial: clientes con sus contactos, su último
 * pedido (días sin pedir) y su última interacción registrada.
 *
 * Si el usuario es comercial, el RLS de `clientes` ya limita a su cartera.
 */
export async function getCartera(codigoEmpresa: string, opts?: { soloSinPedir60?: boolean }): Promise<CarteraComercial> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const contexto = await getContextoComercial();

  const clientes = await todasLasFilas<FilaClienteBase>((desde) =>
    supabase
      .from('clientes')
      .select('id, nombre, codigo_erp, provincia, pais_facturacion, comercial_id, estado')
      .eq('empresa_id', empresa.id)
      .order('nombre')
      .range(desde, desde + TAMANO_PAGINA - 1),
  );

  const [contactos, interacciones, comercialesRes] = await Promise.all([
    todasLasFilas<FilaContactoMin>((desde) =>
      supabase
        .from('contactos')
        .select('cliente_id')
        .eq('empresa_id', empresa.id)
        .eq('activo', true)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<FilaInteraccionMin>((desde) =>
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
  ]);

  const desde12m = new Date(Date.now() - 365 * DIA).toISOString().slice(0, 10);
  const pedidos = await todasLasFilas<FilaPedidoMin>((desde) =>
    supabase
      .from('pedidos')
      .select('cliente_id, fecha, importe')
      .eq('empresa_id', empresa.id)
      .gte('fecha', desde12m)
      .range(desde, desde + TAMANO_PAGINA - 1),
  );

  const contactoPorCliente = new Map<string, number>();
  for (const c of contactos) contactoPorCliente.set(c.cliente_id, (contactoPorCliente.get(c.cliente_id) ?? 0) + 1);

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

  const pedidoPorCliente = new Map<string, { ultimo: string; n: number; importe: number }>();
  for (const p of pedidos) {
    if (!p.cliente_id) continue;
    const prev = pedidoPorCliente.get(p.cliente_id);
    if (prev) {
      prev.n += 1;
      prev.importe += Number(p.importe ?? 0);
      if (p.fecha > prev.ultimo) prev.ultimo = p.fecha;
    } else {
      pedidoPorCliente.set(p.cliente_id, { ultimo: p.fecha, n: 1, importe: Number(p.importe ?? 0) });
    }
  }

  const comercialNombre = new Map(comercialesRes.map((c) => [c.id, c.nombre]));
  const hoyMs = Date.now();

  let filas: FilaCartera[] = clientes.map((c) => {
    const ped = pedidoPorCliente.get(c.id);
    const inter = interaccionPorCliente.get(c.id);
    const diasSinPedir = ped ? Math.floor((hoyMs - Date.parse(ped.ultimo)) / DIA) : null;
    return {
      cliente_id: c.id,
      cliente: c.nombre,
      codigoErp: c.codigo_erp,
      provincia: normalizarProvincia(c.provincia),
      pais: c.pais_facturacion,
      comercial: c.comercial_id ? comercialNombre.get(c.comercial_id) ?? null : null,
      contactos: contactoPorCliente.get(c.id) ?? 0,
      ultimoPedido: ped?.ultimo ?? null,
      diasSinPedir,
      pedidos12m: ped?.n ?? 0,
      importe12m: ped?.importe ?? 0,
      ultimaInteraccion: inter?.ultima ?? null,
      interacciones: inter?.n ?? 0,
    };
  });

  if (opts?.soloSinPedir60) {
    filas = filas.filter((f) => f.diasSinPedir === null || f.diasSinPedir > 60);
  }

  // Los que más tiempo llevan sin pedir primero: es la lista de trabajo.
  filas.sort((a, b) => (b.diasSinPedir ?? 99999) - (a.diasSinPedir ?? 99999) || a.cliente.localeCompare(b.cliente));

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    contexto,
    filas,
    totales: {
      clientes: filas.length,
      conContacto: filas.filter((f) => f.contactos > 0).length,
      sinPedir60: filas.filter((f) => f.diasSinPedir === null || f.diasSinPedir > 60).length,
      sinInteraccion: filas.filter((f) => f.interacciones === 0).length,
    },
  };
}

export type FilaContactoListado = {
  id: string;
  cliente_id: string;
  cliente: string;
  nombre: string;
  apellidos: string | null;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  provincia: string | null;
};

export type ListadoContactos = {
  empresa: { codigo: string; nombre: string };
  filas: FilaContactoListado[];
  porPais: { pais: string; n: number }[];
  porProvincia: { provincia: string; n: number }[];
};

/**
 * Listado de contactos para trabajo comercial y envíos masivos.
 *
 * Filtra por país/provincia, que es lo que permite segmentar un envío. El RLS
 * limita las filas a la cartera del comercial.
 */
export async function getContactos(
  codigoEmpresa: string,
  filtros?: { pais?: string; provincia?: string; sinEmail?: boolean },
): Promise<ListadoContactos> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const [contactos, clientes] = await Promise.all([
    todasLasFilas<Contacto>((desde) =>
      supabase
        .from('contactos')
        .select('id, cliente_id, nombre, apellidos, cargo, email, telefono, movil, pais, provincia, idioma, activo, notas')
        .eq('empresa_id', empresa.id)
        .eq('activo', true)
        .order('nombre')
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ id: string; nombre: string }>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
  ]);

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));

  // La provincia se normaliza ANTES de filtrar: el filtro llega como nombre
  // ("Valencia") y en la base puede estar como código ("46"). Normalizando
  // primero, el filtro por nombre encuentra la fila, y el desplegable de
  // opciones no parte la misma provincia en dos entradas.
  const lista = contactos.map((c) => ({ ...c, provincia: normalizarProvincia(c.provincia) }));
  let filtrada = lista;
  if (filtros?.pais) filtrada = filtrada.filter((c) => c.pais === filtros.pais);
  if (filtros?.provincia) filtrada = filtrada.filter((c) => c.provincia === filtros.provincia);
  if (filtros?.sinEmail) filtrada = filtrada.filter((c) => !c.email);

  const cuenta = <T extends string>(valores: (T | null)[]) => {
    const m = new Map<T, number>();
    for (const v of valores) {
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  };

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    filas: filtrada.map((c) => ({
      id: c.id,
      cliente_id: c.cliente_id,
      cliente: nombreCliente.get(c.cliente_id) ?? '—',
      nombre: c.nombre,
      apellidos: c.apellidos,
      cargo: c.cargo,
      email: c.email,
      telefono: c.telefono,
      pais: c.pais,
      provincia: c.provincia,
    })),
    porPais: cuenta(filtrada.map((c) => c.pais)).map((x) => ({ pais: x.k, n: x.n })),
    porProvincia: cuenta(filtrada.map((c) => c.provincia)).map((x) => ({ provincia: x.k, n: x.n })),
  };
}

export type FichaComercial = {
  cliente: {
    id: string;
    nombre: string;
    codigoErp: string | null;
    provincia: string | null;
    pais: string | null;
    comercial: string | null;
    telefono: string | null;
    email: string | null;
    estadoCrm: EstadoCrm | null;
    motivoPerdida: string | null;
    contactoHabitualId: string | null;
  };
  contactos: Contacto[];
  interacciones: Interaccion[];
  hitos: HitoConAutor[];
  pedidos: { id: string; numero: string | null; fecha: string; estado: string | null; importe: number; diasSinPedir: number }[];
  diasSinPedir: number | null;
};

/** Ficha comercial de un cliente: contactos, histórico e pedidos. */
export async function getFichaComercial(codigoEmpresa: string, clienteId: string): Promise<FichaComercial | null> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: cli } = await supabase
    .from('clientes')
    .select('id, nombre, codigo_erp, provincia, pais_facturacion, comercial_id, telefono, email, estado_crm, motivo_perdida, contacto_habitual_id')
    .eq('id', clienteId)
    .eq('empresa_id', empresa.id)
    .maybeSingle();
  if (!cli) return null;

  const c = cli as {
    id: string;
    nombre: string;
    codigo_erp: string | null;
    provincia: string | null;
    pais_facturacion: string | null;
    comercial_id: string | null;
    telefono: string | null;
    email: string | null;
    estado_crm: string | null;
    motivo_perdida: string | null;
    contacto_habitual_id: string | null;
  };

  const [contactos, interacciones, pedidos, hitosRes] = await Promise.all([
    todasLasFilas<Contacto>((desde) =>
      supabase
        .from('contactos')
        .select('id, cliente_id, nombre, apellidos, cargo, email, telefono, movil, pais, provincia, idioma, activo, notas')
        .eq('cliente_id', clienteId)
        .order('nombre')
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<Interaccion>((desde) =>
      supabase
        .from('interacciones')
        .select('id, cliente_id, contacto_id, comercial_id, usuario_id, tipo, fecha, asunto, contenido, resultado, duracion_min, resumen_ia, conclusiones_ia, resumen_generado_at')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ id: string; numero_erp: string | null; fecha: string; estado: string | null; importe: number | null }>((desde) =>
      supabase
        .from('pedidos')
        .select('id, numero_erp, fecha, estado, importe')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<Hito>((desde) =>
      supabase
        .from('hitos')
        .select('id, cliente_id, comercial_id, usuario_id, fecha, titulo, detalle, created_at')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
  ]);

  let comercial: string | null = null;
  if (c.comercial_id) {
    const { data: com } = await supabase.from('comerciales').select('nombre').eq('id', c.comercial_id).maybeSingle();
    comercial = (com?.nombre as string | null) ?? null;
  }

  // El autor de cada hito se resuelve con el nombre del comercial: en la ficha,
  // "quién lo apuntó" es la mitad del contexto del hito.
  const comercialesRes = await todasLasFilas<{ id: string; nombre: string }>((desde) =>
    supabase
      .from('comerciales')
      .select('id, nombre')
      .eq('empresa_id', empresa.id)
      .range(desde, desde + TAMANO_PAGINA - 1),
  );
  const nombreComercial = new Map(comercialesRes.map((x) => [x.id, x.nombre]));
  const hitos: HitoConAutor[] = hitosRes.map((h) => ({
    ...h,
    autor: h.comercial_id ? nombreComercial.get(h.comercial_id) ?? null : null,
  }));

  const hoyMs = Date.now();
  const pedidosFila = pedidos.slice(0, 30).map((p) => ({
    id: p.id,
    numero: p.numero_erp,
    fecha: p.fecha,
    estado: p.estado,
    importe: Number(p.importe ?? 0),
    diasSinPedir: Math.floor((hoyMs - Date.parse(p.fecha)) / DIA),
  }));

  return {
    cliente: {
      id: c.id,
      nombre: c.nombre,
      codigoErp: c.codigo_erp,
      provincia: normalizarProvincia(c.provincia),
      pais: c.pais_facturacion,
      comercial,
      telefono: c.telefono,
      email: c.email,
      estadoCrm: (c.estado_crm as EstadoCrm | null) ?? null,
      contactoHabitualId: c.contacto_habitual_id,
      motivoPerdida: c.motivo_perdida,
    },
    contactos,
    interacciones,
    hitos,
    pedidos: pedidosFila,
    diasSinPedir: pedidosFila.length ? pedidosFila[0].diasSinPedir : null,
  };
}

/**
 * Resumen/conclusiones de un histórico de interacciones con el LLM.
 *
 * Sin herramientas: es una tarea de redacción sobre un texto que ya tenemos, no
 * de consulta de datos. Así el modelo no puede inventar cifras ni tocar la BD.
 */
export async function resumirInteracciones(
  cliente: string,
  interacciones: { fecha: string; tipo: string; asunto: string | null; contenido: string; resultado: string | null }[],
  modo: 'resumen' | 'conclusiones',
): Promise<string> {
  const historial = interacciones
    .map((i) => `[${i.fecha.slice(0, 10)} · ${i.tipo}${i.asunto ? ` · ${i.asunto}` : ''}${i.resultado ? ` · ${i.resultado}` : ''}]\n${i.contenido}`)
    .join('\n\n');

  const system =
    modo === 'resumen'
      ? `Eres un asistente de CRM. Resume el histórico de conversaciones con el cliente en español, en un máximo de 8 líneas. Sé factual: no inventes datos que no estén en el texto. Destaca temas recurrentes, peticiones y estado actual de la relación.`
      : `Eres un asistente de CRM. Extrae conclusiones y próximos pasos del histórico de conversaciones con el cliente, en español, en forma de lista breve. Sé factual: no inventes datos. Indica riesgos detectados (quejas, impagos, competencia, caída de actividad) y acciones concretas recomendadas.`;

  const res = await callLLM(system, [{ role: 'user', content: `Cliente: ${cliente}\n\nHistórico:\n${historial}` }], []);
  return res.text.trim();
}
