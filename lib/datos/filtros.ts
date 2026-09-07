import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

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

function culturarIds<T extends { id: string }>(filas: T[] | null): string[] {
  return (filas ?? []).map((f) => f.id);
}

// Ids de factura que cumplen todos los filtros dentro de la ventana [baseDesde, baseHasta]
// (ventana propia del módulo). Devuelve null si no hay ningún filtro que aplicar.
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

  const { data } = await query;
  let ids = new Set(culturarIds(data));

  if (porArticulo) {
    let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
    if (familia) aq = aq.eq('familia_id', familia);
    if (marca) aq = aq.eq('marca_id', marca);
    const { data: arts } = await aq;
    const artIds = culturarIds(arts);
    if (artIds.length === 0) {
      return new Set<string>();
    }
    const { data: links } = await supabase
      .from('factura_lineas')
      .select('factura_id')
      .in('articulo_id', artIds);
    const conArticulo = new Set((links ?? []).map((l) => l.factura_id as string));
    ids = new Set([...ids].filter((id) => conArticulo.has(id)));
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
  const { data } = await query;
  let ids = new Set(culturarIds(data));

  if (porArticulo) {
    let aq = supabase.from('articulos').select('id').eq('empresa_id', empresaId);
    if (familia) aq = aq.eq('familia_id', familia);
    if (marca) aq = aq.eq('marca_id', marca);
    const { data: arts } = await aq;
    const artIds = culturarIds(arts);
    if (artIds.length === 0) {
      return new Set<string>();
    }
    const { data: links } = await supabase
      .from('pedido_lineas')
      .select('pedido_id')
      .in('articulo_id', artIds);
    const conArticulo = new Set((links ?? []).map((l) => l.pedido_id as string));
    ids = new Set([...ids].filter((id) => conArticulo.has(id)));
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
  const { data } = await aq;
  return new Set(culturarIds(data));
}

export function filtrarPorIds<T extends { id: string }>(filas: T[], ids: Set<string> | null): T[] {
  return ids ? filas.filter((f) => ids.has(f.id)) : filas;
}