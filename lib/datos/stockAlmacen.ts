import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';

export type FiltroStock = 'todos' | 'con' | 'sin';

export type FilaStockAlmacen = {
  articulo_codigo: string;
  articulo_nombre: string | null;
  almacen_codigo: string;
  almacen_nombre: string | null;
  lote: string;
  unidades: number;
  coste_medio: number | null;
  coste: number;
  ubicacion: string | null;
};

/** Alerta de rotura o necesidad de compra para un artículo. */
export type AlertaStock = {
  codigo: string;
  articulo: string;
  stock: number;
  punto: number;
  mediaDiaria: number;
  enMar: number;
  propuesta: number;
  rotura: boolean;
};

/** Agrupación por artículo: una cabecera con sus modelos/almacenes/lotes dentro. */
export type GrupoStock = {
  clave: string;
  nombre: string;
  unidades: number;
  valor: number;
  enMar: number;
  filas: FilaStockAlmacen[];
};

export type StockAlmacenResumen = {
  empresa: { codigo: string; nombre: string };
  filas: FilaStockAlmacen[];
  grupos: GrupoStock[];
  alertas: AlertaStock[];
  totalFilas: number;
  referencias: number;
  refsConStock: number;
  refsSinStock: number;
  unidades: number;
  valor: number;
  almacenes: { codigo: string; nombre: string }[];
  filtros: { q: string; estado: FiltroStock; almacen: string };
};

function sanear(texto: string): string {
  return texto.replace(/[,()%]/g, ' ').trim();
}

export async function getStockAlmacen(
  codigoEmpresa: string,
  opciones: { q?: string; estado?: string; almacen?: string } = {},
): Promise<StockAlmacenResumen> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const q = (opciones.q ?? '').trim();
  const estado: FiltroStock = opciones.estado === 'con' || opciones.estado === 'sin' ? opciones.estado : 'todos';
  const almacen = (opciones.almacen ?? '').trim();

  const construir = (desde: number) => {
    let query = supabase
      .from('stock_almacen')
      .select(
        'articulo_codigo, articulo_nombre, almacen_codigo, almacen_nombre, lote, unidades, coste_medio, ubicacion',
      )
      .eq('empresa_id', empresa.id)
      .order('articulo_codigo')
      .order('almacen_codigo')
      .order('lote')
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (estado === 'con') query = query.gt('unidades', 0);
    if (estado === 'sin') query = query.lte('unidades', 0);
    if (almacen) query = query.eq('almacen_codigo', almacen);
    if (q) {
      const like = `%${sanear(q)}%`;
      query = query.or(
        `articulo_codigo.ilike.${like},articulo_nombre.ilike.${like},lote.ilike.${like},almacen_codigo.ilike.${like}`,
      );
    }
    return query;
  };

  const hace90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [filas, almacenesRaw, artsRes, consumoRes, lotesRes, marRes] = await Promise.all([
    todasLasFilas<FilaStockAlmacen>(construir),
    todasLasFilas<{ almacen_codigo: string; almacen_nombre: string | null }>((desde) =>
      supabase
        .from('stock_almacen')
        .select('almacen_codigo, almacen_nombre')
        .eq('empresa_id', empresa.id)
        .order('almacen_codigo')
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ id: string; codigo_erp: string; punto_pedido: number | null }>((desde) =>
      supabase
        .from('articulos')
        .select('id, codigo_erp, punto_pedido')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ articulo_id: string; unidades: number }>((desde) =>
      supabase
        .from('v_consumo_diario')
        .select('articulo_id, unidades')
        .eq('empresa_id', empresa.id)
        .gte('fecha', hace90)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ articulo_codigo: string; lote: string; fecha: string; coste_unitario: number }>((desde) =>
      supabase
        .from('lotes_coste')
        .select('articulo_codigo, lote, fecha, coste_unitario')
        .eq('empresa_id', empresa.id)
        .order('fecha', { ascending: true })
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    todasLasFilas<{ articulo_codigo: string; unidades: number }>((desde) =>
      supabase
        .from('stock_en_mar')
        .select('articulo_codigo, unidades')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
  ]);

  // Coste real: el del lote si hay compra de ese lote; si no, el último del artículo.
  const costeLote = new Map<string, number>();
  const costeArticulo = new Map<string, number>();
  for (const l of lotesRes) {
    const coste = Number(l.coste_unitario ?? 0);
    costeLote.set(`${l.articulo_codigo}|${l.lote ?? ''}`, coste);
    costeArticulo.set(l.articulo_codigo, coste);
  }
  const enMarPorArticulo = new Map<string, number>();
  for (const m of marRes) {
    enMarPorArticulo.set(m.articulo_codigo, (enMarPorArticulo.get(m.articulo_codigo) ?? 0) + Number(m.unidades ?? 0));
  }
  const filasConCoste: FilaStockAlmacen[] = filas.map((f) => ({
    ...f,
    coste:
      costeLote.get(`${f.articulo_codigo}|${f.lote ?? ''}`) ??
      costeArticulo.get(f.articulo_codigo) ??
      Number(f.coste_medio ?? 0),
  }));

  const conStock = new Set<string>();
  const todasRefs = new Set<string>();
  let unidades = 0;
  let valor = 0;
  for (const f of filasConCoste) {
    todasRefs.add(f.articulo_codigo);
    const u = Number(f.unidades ?? 0);
    unidades += u;
    valor += u * f.coste;
    if (u > 0) conStock.add(f.articulo_codigo);
  }

  const almacenesMap = new Map<string, string>();
  for (const a of almacenesRaw) {
    if (!almacenesMap.has(a.almacen_codigo)) {
      almacenesMap.set(a.almacen_codigo, a.almacen_nombre || a.almacen_codigo || '—');
    }
  }

  // Alertas: rotura (sin stock con ventas) y bajo punto de pedido.
  const codigoPorId = new Map(artsRes.map((a) => [a.id, a.codigo_erp]));
  const puntoPorCodigo = new Map(artsRes.map((a) => [a.codigo_erp, Number(a.punto_pedido ?? 0)]));
  const consumoPorCodigo = new Map<string, number>();
  for (const c of consumoRes) {
    const codigo = codigoPorId.get(c.articulo_id);
    if (!codigo) continue;
    consumoPorCodigo.set(codigo, (consumoPorCodigo.get(codigo) ?? 0) + Number(c.unidades ?? 0));
  }
  const stockPorCodigo = new Map<string, number>();
  for (const f of filasConCoste) {
    stockPorCodigo.set(f.articulo_codigo, (stockPorCodigo.get(f.articulo_codigo) ?? 0) + Number(f.unidades ?? 0));
  }

  const alertas: AlertaStock[] = [];
  for (const [codigo, stock] of stockPorCodigo) {
    const consumo = consumoPorCodigo.get(codigo) ?? 0;
    const media = consumo / 90;
    const punto = puntoPorCodigo.get(codigo) ?? 0;
    const enMar = enMarPorArticulo.get(codigo) ?? 0;
    const propuesta = media > 0 ? Math.max(0, Math.round(media * 45 - stock - enMar)) : 0;
    const rotura = stock <= 0 && consumo > 0;
    if (!rotura && !(punto > 0 && stock < punto) && propuesta <= 0) continue;
    alertas.push({
      codigo,
      articulo: filasConCoste.find((f) => f.articulo_codigo === codigo)?.articulo_nombre ?? codigo,
      stock,
      punto,
      mediaDiaria: media,
      enMar,
      propuesta,
      rotura,
    });
  }
  alertas.sort((a, b) => Number(b.rotura) - Number(a.rotura) || b.propuesta - a.propuesta);

  const gruposMap = new Map<string, GrupoStock>();
  for (const f of filasConCoste) {
    const nombre = (f.articulo_nombre ?? '').trim() || f.articulo_codigo;
    const clave = nombre.toLocaleUpperCase('es');
    const g = gruposMap.get(clave) ?? {
      clave,
      nombre,
      unidades: 0,
      valor: 0,
      enMar: enMarPorArticulo.get(f.articulo_codigo) ?? 0,
      filas: [],
    };
    g.unidades += Number(f.unidades ?? 0);
    g.valor += Number(f.unidades ?? 0) * f.coste;
    g.filas.push(f);
    gruposMap.set(clave, g);
  }
  const grupos = [...gruposMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  for (const g of grupos) {
    g.filas.sort((a, b) =>
      `${a.articulo_codigo}|${a.almacen_codigo}|${a.lote}`.localeCompare(`${b.articulo_codigo}|${b.almacen_codigo}|${b.lote}`),
    );
  }

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    filas: filasConCoste,
    grupos,
    alertas: alertas.slice(0, 25),
    totalFilas: filas.length,
    referencias: todasRefs.size,
    refsConStock: conStock.size,
    refsSinStock: todasRefs.size - conStock.size,
    unidades,
    valor,
    almacenes: [...almacenesMap.entries()]
      .map(([codigo, nombre]) => ({ codigo, nombre }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    filtros: { q, estado, almacen },
  };
}
