import { createClient } from '@/lib/supabase/server';
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

export type OpcionesFiltros = {
  clientes: OpcionFiltro[];
  comerciales: OpcionFiltro[];
  familias: OpcionFiltro[];
  marcas: OpcionFiltro[];
};

export async function getOpcionesFiltros(codigoEmpresa: string): Promise<OpcionesFiltros> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const [clientes, comerciales, familias, marcas] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('empresa_id', empresa.id).order('nombre'),
    supabase.from('comerciales').select('id, nombre').eq('empresa_id', empresa.id).order('nombre'),
    supabase.from('familias_articulo').select('id, nombre').eq('empresa_id', empresa.id).order('nombre'),
    supabase.from('marcas').select('id, nombre').eq('empresa_id', empresa.id).order('nombre'),
  ]);

  return {
    clientes: (clientes.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre })),
    comerciales: (comerciales.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre })),
    familias: (familias.data ?? []).map((f) => ({ id: f.id, nombre: f.nombre })),
    marcas: (marcas.data ?? []).map((m) => ({ id: m.id, nombre: m.nombre })),
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
  const porArticulo = Boolean(familia || marca);
  const sinRestriccion = !cliente && !comercial && !porArticulo && !desde && !hasta;
  if (sinRestriccion) return null;

  const gte = desde ?? baseDesde;
  const lte = hasta ?? baseHasta;

  let query = supabase
    .from('facturas')
    .select('id')
    .eq('empresa_id', empresaId)
    .gte('fecha', gte)
    .lte('fecha', lte);
  if (cliente) query = query.eq('cliente_id', cliente);
  if (comercial) query = query.eq('comercial_id', comercial);

  const filas = await todasLasFilas<{ id: string }>((desde) => query.range(desde, desde + TAMANO_PAGINA - 1));
  let ids = new Set(filas.map((f) => f.id));

  if (porArticulo) {
    let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
    if (familia) aq = aq.eq('familia_id', familia);
    if (marca) aq = aq.eq('marca_id', marca);
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
  const sinRestriccion = !cliente && !porArticulo && !desde && !hasta;
  if (sinRestriccion) return null;

  const gte = desde ?? baseDesde;
  const lte = hasta ?? baseHasta;

  let query = supabase
    .from('pedidos')
    .select('id')
    .eq('empresa_id', empresaId)
    .gte('fecha_entrada', gte)
    .lte('fecha_entrada', lte);
  if (cliente) query = query.eq('cliente_id', cliente);
  const filas = await todasLasFilas<{ id: string }>((desde) => query.range(desde, desde + TAMANO_PAGINA - 1));
  let ids = new Set(filas.map((f) => f.id));

  if (porArticulo) {
    let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
    if (familia) aq = aq.eq('familia_id', familia);
    if (marca) aq = aq.eq('marca_id', marca);
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
  const { familia, marca } = filtros;
  if (!familia && !marca) return null;

  let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
  if (familia) aq = aq.eq('familia_id', familia);
  if (marca) aq = aq.eq('marca_id', marca);
  const filas = await todasLasFilas<{ id: string }>((desde) => aq.range(desde, desde + TAMANO_PAGINA - 1));
  return new Set(filas.map((f) => f.id));
}

export function filtrarPorIds<T extends { id: string }>(filas: T[], ids: Set<string> | null): T[] {
  return ids ? filas.filter((f) => ids.has(f.id)) : filas;
}