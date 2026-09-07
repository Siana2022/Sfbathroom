import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getFacturaIdsFiltradas, type Filtros } from '@/lib/datos/filtros';

export const TIPO_LABEL: Record<string, string> = {
  factura: 'Factura',
  abono: 'Abono',
  nota_cargo: 'Nota de cargo',
};

export type DocumentoResumen = {
  id: string;
  numero: string;
  fecha: string;
  tipo: string;
  cliente: string;
  comercial: string;
  lineas: number;
  importe: number;
};

export type DocumentoLista = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  total: number;
  porPagina: number;
  documento: DocumentoResumen[];
};

export type LineaDocumento = {
  codigo: string;
  articulo: string;
  familia: string;
  marca: string;
  cantidad: number;
  precio: number;
  descuento: number;
  importe: number;
};

export type DocumentoDetalle = {
  empresa: { id: string; codigo: string; nombre: string };
  id: string;
  numero: string;
  fecha: string;
  tipo: string;
  cliente: string;
  comercial: string;
  base: number;
  descuentoPie: number;
  portes: number;
  rappel: number;
  total: number;
  pedido: { numero: string; fecha: string; estado: string } | null;
  albaran: string | null;
  anula: { numero: string } | null;
  anuladaPor: { numero: string } | null;
  lineas: LineaDocumento[];
};

type FilaFactura = {
  id: string;
  numero_erp: string | null;
  fecha: string;
  tipo_documento: string;
  total: number | null;
  base_imponible: number | null;
  portes: number | null;
  descuento_pie: number | null;
  rappel_devengado: number | null;
  cliente_id: string | null;
  comercial_id: string | null;
  pedido_id: string | null;
  albaran_numero: string | null;
  factura_anula_id: string | null;
  empresa_id: string | null;
};

export async function getDocumentos(
  codigoEmpresa: string,
  anio: number,
  filtros: Filtros,
  pagina = 1,
  porPagina = 50
): Promise<DocumentoLista> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const idsFiltrados = await getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anio}-01-01`, `${anio}-12-31`);

  const { data: filasRaw } = await supabase
    .from('facturas')
    .select('id, numero_erp, fecha, tipo_documento, total, cliente_id, comercial_id')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const facturas = ((filasRaw ?? []) as Partial<FilaFactura>[]).filter((f) => (idsFiltrados ? idsFiltrados.has(f.id!) : true));

  const ids = facturas.map((f) => f.id!);
  const [cliRes, comRes, linRes] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('empresa_id', empresa.id),
    supabase.from('comerciales').select('id, nombre'),
    ids.length
      ? supabase.from('factura_lineas').select('factura_id, id').in('factura_id', ids)
      : Promise.resolve({ data: [] }),
  ]);
  const clienteNombre = new Map((cliRes.data ?? []).map((c) => [c.id, (c as { nombre: string }).nombre]));
  const comercialNombre = new Map((comRes.data ?? []).map((c) => [c.id, (c as { nombre: string }).nombre]));
  const lineasPorFactura = new Map<string, number>();
  for (const l of (linRes.data ?? []) as { factura_id: string }[]) {
    lineasPorFactura.set(l.factura_id, (lineasPorFactura.get(l.factura_id) ?? 0) + 1);
  }

  const ordenadas = facturas
    .map((f) => ({
      id: f.id!,
      numero: f.numero_erp ?? '—',
      fecha: f.fecha!,
      tipo: TIPO_LABEL[f.tipo_documento ?? 'factura'] ?? f.tipo_documento!,
      cliente: clienteNombre.get(f.cliente_id ?? '') ?? '—',
      comercial: comercialNombre.get(f.comercial_id ?? '') ?? '—',
      lineas: lineasPorFactura.get(f.id!) ?? 0,
      importe: Number(f.total ?? 0),
    }))
    .sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : (b.numero > a.numero ? 1 : -1)))
    .sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha > b.fecha ? -1 : 1));

  const desde = (pagina - 1) * porPagina;
  const documento = ordenadas.slice(desde, desde + porPagina);

  return { empresa, anio, total: ordenadas.length, porPagina, documento };
}

export async function getDocumento(id: string): Promise<DocumentoDetalle | null> {
  const supabase = createClient();
  const { data: fila } = await supabase
    .from('facturas')
    .select(
      'id, numero_erp, fecha, tipo_documento, total, base_imponible, portes, descuento_pie, rappel_devengado, cliente_id, comercial_id, pedido_id, albaran_numero, factura_anula_id, empresa_id'
    )
    .eq('id', id)
    .maybeSingle();
  if (!fila) return null;
  const f = fila as FilaFactura;

  const [cliRes, comRes, pedidoRes, anulaRes, anuladaRes, lineasRes, empresa] = await Promise.all([
    f.cliente_id ? supabase.from('clientes').select('id, nombre').eq('id', f.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    f.comercial_id ? supabase.from('comerciales').select('id, nombre').eq('id', f.comercial_id).maybeSingle() : Promise.resolve({ data: null }),
    f.pedido_id
      ? supabase.from('pedidos').select('numero_erp, fecha_entrada, estado').eq('id', f.pedido_id).maybeSingle()
      : Promise.resolve({ data: null }),
    f.factura_anula_id
      ? supabase.from('facturas').select('numero_erp').eq('id', f.factura_anula_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('facturas').select('numero_erp').eq('factura_anula_id', f.id).maybeSingle(),
    supabase.from('factura_lineas').select('articulo_id, cantidad, precio_unitario, descuento_pct, importe').eq('factura_id', f.id),
    f.empresa_id ? supabase.from('empresas').select('id, codigo, nombre').eq('id', f.empresa_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const lineas = lineasRes.data ?? [];
  const artIds = [...new Set(lineas.map((l) => l.articulo_id).filter(Boolean))] as string[];
  const artRes = artIds.length
    ? await supabase.from('articulos').select('id, codigo_erp, nombre, familia_id, marca_id').in('id', artIds)
    : { data: [] };
  const articulos = new Map((artRes.data ?? []).map((a) => [a.id, a as { codigo_erp: string | null; nombre: string; familia_id: string | null; marca_id: string | null }]));
  const familiaIds = [...new Set([...articulos.values()].map((a) => a.familia_id).filter(Boolean))] as string[];
  const marcaIds = [...new Set([...articulos.values()].map((a) => a.marca_id).filter(Boolean))] as string[];
  const [famRes2, marRes2] = await Promise.all([
    familiaIds.length ? supabase.from('familias_articulo').select('id, nombre').in('id', familiaIds) : Promise.resolve({ data: [] }),
    marcaIds.length ? supabase.from('marcas').select('id, nombre').in('id', marcaIds) : Promise.resolve({ data: [] }),
  ]);
  const familiaNombre = new Map((famRes2.data ?? []).map((x) => [x.id, (x as { nombre: string }).nombre]));
  const marcaNombre = new Map((marRes2.data ?? []).map((x) => [x.id, (x as { nombre: string }).nombre]));

  const lineaDetalle: LineaDocumento[] = lineas.map((l) => {
    const art = l.articulo_id ? articulos.get(l.articulo_id) : undefined;
    return {
      codigo: art?.codigo_erp ?? '—',
      articulo: art?.nombre ?? '—',
      familia: art?.familia_id ? familiaNombre.get(art.familia_id) ?? '—' : '—',
      marca: art?.marca_id ? marcaNombre.get(art.marca_id) ?? '—' : '—',
      cantidad: Number(l.cantidad ?? 0),
      precio: Number(l.precio_unitario ?? 0),
      descuento: Number(l.descuento_pct ?? 0),
      importe: Number(l.importe ?? 0),
    };
  });

  const emp = (empresa.data as { id: string; codigo: string; nombre: string } | null) ?? { id: '', codigo: 'SF', nombre: 'SF Bathroom' };

  return {
    empresa: emp,
    id: f.id,
    numero: f.numero_erp ?? '—',
    fecha: f.fecha!,
    tipo: TIPO_LABEL[f.tipo_documento ?? 'factura'] ?? f.tipo_documento!,
    cliente: (cliRes.data as { nombre: string } | null)?.nombre ?? '—',
    comercial: (comRes.data as { nombre: string } | null)?.nombre ?? '—',
    base: Number(f.base_imponible ?? 0),
    descuentoPie: Number(f.descuento_pie ?? 0),
    portes: Number(f.portes ?? 0),
    rappel: Number(f.rappel_devengado ?? 0),
    total: Number(f.total ?? 0),
    pedido: pedidoRes.data
      ? { numero: (pedidoRes.data as { numero_erp: string }).numero_erp ?? '—', fecha: (pedidoRes.data as { fecha_entrada: string }).fecha_entrada, estado: (pedidoRes.data as { estado: string }).estado }
      : null,
    albaran: f.albaran_numero ?? null,
    anula: anulaRes.data ? { numero: (anulaRes.data as { numero_erp: string }).numero_erp ?? '—' } : null,
    anuladaPor: anuladaRes.data ? { numero: (anuladaRes.data as { numero_erp: string }).numero_erp ?? '—' } : null,
    lineas: lineaDetalle,
  };
}