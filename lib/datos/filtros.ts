import { createClient } from '@/lib/supabase/server';
import { esMarcaStarbath } from '@/lib/agrupacionComercial';
import { getUsuario } from '@/lib/datos/role';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { todasLasFilas, TAMANO_LOTE, TAMANO_PAGINA } from '@/lib/datos/query';

export type Filtros = {
  cliente?: string;
  comercial?: string;
  familia?: string;
  marca?: string;
  desde?: string;
  hasta?: string;
};

export type SearchParams = { [key: string]: string | string[] | undefined };

const CLAVES: (keyof Filtros)[] = ['cliente', 'comercial', 'familia', 'marca', 'desde', 'hasta'];

export function parseFiltros(sp: SearchParams | undefined): Filtros {
  const f: Filtros = {};
  for (const k of CLAVES) {
    const v = sp?.[k];
    if (typeof v === 'string' && v.trim() !== '') f[k] = v.trim();
  }
  return f;
}

export function hayFiltros(f: Filtros): boolean {
  return CLAVES.some((k) => Boolean(f[k]));
}

export type OpcionFiltro = { id: string; nombre: string };

/** Nombres que no son comerciales reales (demo o valores regionales de A3ERP). */
const COMERCIALES_INVALIDOS = new Set([
  '77',
  'AFRICA',
  'AMERICA',
  'ASIA',
  'ANA VIDAL',
  'LUCIA FERRER',
  'MARCO ROSSI',
  'ORIENTE MEDIO',
  'PROVEEDORES',
  'CONTRACT',
  'ESTUDIO ARQUITECTURA',
]);

/** ¿Es un comercial real (no demo ni valor regional de A3ERP)? */
export function esComercialValido(nombre: string): boolean {
  return !COMERCIALES_INVALIDOS.has(normalizarNombre(nombre));
}

/** Mayúsculas sin tildes, para comparar nombres pese a acentos. */
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export type OpcionesFiltros = {
  clientes: OpcionFiltro[];
  comerciales: OpcionFiltro[];
  familias: OpcionFiltro[];
  marcas: OpcionFiltro[];
};

// Cuando se pasa `scopeClientes`, la lista de clientes se limita a los que tienen
// documentos (pedidos o facturas) en ese ejercicio, para que el selector no ofrezca
// clientes sin actividad (que devolverían páginas vacías).
export type ScopeClientes = { fuente: 'facturas' | 'pedidos'; anio: number };

async function clientesConDocumentos(
  supabase: ReturnType<typeof createClient>,
  empresaId: string,
  scope: ScopeClientes,
): Promise<Set<string>> {
  const desde = `${scope.anio}-01-01`;
  const hasta = `${scope.anio}-12-31`;
  let filas: { cliente_id: string | null }[];
  if (scope.fuente === 'pedidos') {
    filas = await todasLasFilas<{ cliente_id: string | null }>((desde2) =>
      supabase
        .from('pedidos')
        .select('cliente_id')
        .eq('empresa_id', empresaId)
        .gte('fecha_entrada', desde)
        .lte('fecha_entrada', hasta)
        .not('cliente_id', 'is', null)
        .range(desde2, desde2 + TAMANO_PAGINA - 1),
    );
  } else {
    filas = await todasLasFilas<{ cliente_id: string | null }>((desde2) =>
      supabase
        .from('facturas')
        .select('cliente_id')
        .eq('empresa_id', empresaId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .not('cliente_id', 'is', null)
        .range(desde2, desde2 + TAMANO_PAGINA - 1),
    );
  }
  return new Set(filas.map((f) => f.cliente_id as string).filter(Boolean));
}

export async function getOpcionesFiltros(
  codigoEmpresa: string,
  scopeClientes?: ScopeClientes,
): Promise<OpcionesFiltros> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: activosRaw } = await supabase.rpc('comerciales_con_actividad', {
    p_codigo_empresa: codigoEmpresa,
  });
  const comercialesActivos = Array.isArray(activosRaw) ? new Set(activosRaw as string[]) : null;
  const usuario = await getUsuario();
  const soloPropio = usuario?.rol === 'comercial' ? usuario.comercialIds : [];

  const [{ data: empresaFila }, { data: marcasTodas }] = await Promise.all([
    supabase.from('empresas').select('nombre').eq('codigo', codigoEmpresa).maybeSingle(),
    supabase.from('marcas').select('id, nombre'),
  ]);
  const nombreEmpresa = String((empresaFila as { nombre?: string } | null)?.nombre ?? codigoEmpresa);
  const marcasFiltradas = ((marcasTodas ?? []) as { id: string; nombre: string }[])
    .filter((m) => m.nombre === 'STARBATH' || m.nombre === nombreEmpresa)
    .map((m) => ({ id: m.id, nombre: m.nombre === 'STARBATH' ? 'STARBATH' : nombreEmpresa }));

  const [clientes, comerciales, articulosFam] = await Promise.all([
    todasLasFilas<{ id: string; nombre: string }>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre')
        .eq('empresa_id', empresa.id)
        .order('nombre')
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    supabase.from('comerciales').select('id, nombre').eq('empresa_id', empresa.id).order('nombre'),
    todasLasFilas<{ familia: string | null }>((desde) =>
      supabase
        .from('articulos')
        .select('familia')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1)
    ),
    supabase.from('empresas').select('nombre').eq('codigo', codigoEmpresa).maybeSingle(),
  ]);

  let opcionesClientes = clientes.map((c) => ({ id: c.id, nombre: c.nombre }));
  if (scopeClientes) {
    const conActividad = await clientesConDocumentos(supabase, empresa.id, scopeClientes);
    opcionesClientes = opcionesClientes.filter((c) => conActividad.has(c.id));
  }

  return {
    clientes: opcionesClientes,
    comerciales: (comerciales.data ?? [])
      .filter((c) => soloPropio.length === 0 || soloPropio.includes(c.id))
      .filter((c) => !comercialesActivos || comercialesActivos.has(c.id))
      .filter((c) => !COMERCIALES_INVALIDOS.has(normalizarNombre(String(c.nombre ?? ''))))
      .filter((c) => {
        const n = String(c.nombre ?? '').trim();
        if (n === '' || n === '—' || n === '-') return false;
        if (/^sin nombre$/i.test(n)) return false;
        if (/utilizar pr[oó]ximo comercial/i.test(n)) return false;
        if (/^(prueba|test|zz)/i.test(n)) return false;
        return true;
      })
      .map((c) => ({ id: c.id, nombre: c.nombre })),
    familias: [...new Set(articulosFam.map((a) => a.familia).filter((f): f is string => Boolean(f)))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((f) => ({ id: f, nombre: f })),
    marcas: marcasFiltradas,
  };
}

// Ids de factura que cumplen todos los filtros dentro de la ventana [baseDesde, baseHasta]
// (ventana propia del módulo). Devuelve null si no hay ningún filtro que aplicar.
//
// Escala con datos reales: los selects de ids se paginan (PostgREST limita a 1000
// filas por petición) y el cruce por artículo se hace por lotes cruzados (factura ×
// artículo), evitando el `.in('articulo_id', [...miles])` que rompe la URL.
export async function getFacturaIdsFiltradas(
  supabase: ReturnType<typeof createClient>,
  empresaId: string,
  filtros: Filtros,
  baseDesde: string,
  baseHasta: string,
): Promise<Set<string> | null> {
  const { cliente, comercial, familia, marca, desde, hasta } = filtros;
  const porArticulo = Boolean(familia);
  const sinRestriccion = !cliente && !comercial && !marca && !porArticulo && !desde && !hasta;
  if (sinRestriccion) return null;

  const gte = desde ?? baseDesde;
  const lte = hasta ?? baseHasta;

  let query = supabase
    .from('facturas')
    .select('id, comercial_id')
    .eq('empresa_id', empresaId)
    .gte('fecha', gte)
    .lte('fecha', lte);
  if (cliente) query = query.eq('cliente_id', cliente);
  if (comercial) query = query.eq('comercial_id', comercial);

  let filas = await todasLasFilas<{ id: string; comercial_id: string | null }>((desde) =>
    query.range(desde, desde + TAMANO_PAGINA - 1),
  );

  if (marca) {
    const { data: marcaFila } = await supabase.from('marcas').select('nombre').eq('id', marca).maybeSingle();
    const esStarbath = String((marcaFila as { nombre?: string } | null)?.nombre ?? '').toUpperCase().includes('STARBATH');
    const coms = await todasLasFilas<{ id: string; nombre: string }>((desde) =>
      supabase.from('comerciales').select('id, nombre').range(desde, desde + TAMANO_PAGINA - 1),
    );
    const sb = new Set(coms.filter((c) => esMarcaStarbath(String(c.nombre))).map((c) => c.id));
    filas = filas.filter((f) => (esStarbath ? sb.has(f.comercial_id ?? '') : !sb.has(f.comercial_id ?? '')));
  }

  let ids = new Set(filas.map((f) => f.id));

  if (porArticulo) {
    let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
    if (familia) aq = aq.eq('familia', familia);
    const artIds = (
      await todasLasFilas<{ id: string }>((desde) => aq.range(desde, desde + TAMANO_PAGINA - 1))
    ).map((a) => a.id);
    if (artIds.length === 0) {
      return new Set<string>();
    }
    const idsBase = [...ids];
    const conArticulo = new Set<string>();
    for (let i = 0; i < idsBase.length; i += TAMANO_LOTE) {
      const loteF = idsBase.slice(i, i + TAMANO_LOTE);
      for (let j = 0; j < artIds.length; j += TAMANO_LOTE) {
        const loteA = artIds.slice(j, j + TAMANO_LOTE);
        const { data } = await supabase
          .from('factura_lineas')
          .select('factura_id')
          .in('factura_id', loteF)
          .in('articulo_id', loteA);
        for (const l of data ?? []) conArticulo.add(l.factura_id as string);
      }
    }
    ids = new Set(idsBase.filter((id) => conArticulo.has(id)));
  }

  return ids;
}

// Ids de pedido que cumplen cliente / familia / marca / rango de fecha_entrada.
export async function getPedidoIdsFiltrados(
  supabase: ReturnType<typeof createClient>,
  empresaId: string,
  filtros: Filtros,
  baseDesde: string,
  baseHasta: string,
): Promise<Set<string> | null> {
  const { cliente, familia, marca, desde, hasta } = filtros;
  const porArticulo = Boolean(familia || marca);
  const sinRestriccion = !cliente && !marca && !porArticulo && !desde && !hasta;
  if (sinRestriccion) return null;

  const gte = desde ?? baseDesde;
  const lte = hasta ?? baseHasta;

  let query = supabase
    .from('pedidos')
    .select('id, comercial_id')
    .eq('empresa_id', empresaId)
    .gte('fecha_entrada', gte)
    .lte('fecha_entrada', lte);
  if (cliente) query = query.eq('cliente_id', cliente);
  let filas = await todasLasFilas<{ id: string; comercial_id: string | null }>((desde) =>
    query.range(desde, desde + TAMANO_PAGINA - 1),
  );

  if (marca) {
    const { data: marcaFila } = await supabase.from('marcas').select('nombre').eq('id', marca).maybeSingle();
    const esStarbath = String((marcaFila as { nombre?: string } | null)?.nombre ?? '').toUpperCase().includes('STARBATH');
    const coms = await todasLasFilas<{ id: string; nombre: string }>((desde) =>
      supabase.from('comerciales').select('id, nombre').range(desde, desde + TAMANO_PAGINA - 1),
    );
    const sb = new Set(coms.filter((c) => esMarcaStarbath(String(c.nombre))).map((c) => c.id));
    filas = filas.filter((f) => (esStarbath ? sb.has(f.comercial_id ?? '') : !sb.has(f.comercial_id ?? '')));
  }

  let ids = new Set(filas.map((f) => f.id));

  if (porArticulo) {
    let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
    if (familia) aq = aq.eq('familia', familia);
    const artIds = (
      await todasLasFilas<{ id: string }>((desde) => aq.range(desde, desde + TAMANO_PAGINA - 1))
    ).map((a) => a.id);
    if (artIds.length === 0) {
      return new Set<string>();
    }
    const idsBase = [...ids];
    const conArticulo = new Set<string>();
    for (let i = 0; i < idsBase.length; i += TAMANO_LOTE) {
      const loteP = idsBase.slice(i, i + TAMANO_LOTE);
      for (let j = 0; j < artIds.length; j += TAMANO_LOTE) {
        const loteA = artIds.slice(j, j + TAMANO_LOTE);
        const { data } = await supabase
          .from('pedido_lineas')
          .select('pedido_id')
          .in('pedido_id', loteP)
          .in('articulo_id', loteA);
        for (const l of data ?? []) conArticulo.add(l.pedido_id as string);
      }
    }
    ids = new Set(idsBase.filter((id) => conArticulo.has(id)));
  }

  return ids;
}

// Ids de artículo que cumplen familia / marca (para stock, punto-en-el-tiempo).
export async function getArticuloIdsFiltrados(
  supabase: ReturnType<typeof createClient>,
  empresaId: string,
  filtros: Filtros,
): Promise<Set<string> | null> {
  // La marca ya no es del artículo (se deduce del comercial), así que el filtro
  // de producto solo aplica por familia.
  const { familia } = filtros;
  if (!familia) return null;

  let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
  if (familia) aq = aq.eq('familia', familia);
  const filas = await todasLasFilas<{ id: string }>((desde) => aq.range(desde, desde + TAMANO_PAGINA - 1));
  return new Set(filas.map((f) => f.id));
}

export function filtrarPorIds<T extends { id: string }>(filas: T[], ids: Set<string> | null): T[] {
  return ids ? filas.filter((f) => ids.has(f.id)) : filas;
}