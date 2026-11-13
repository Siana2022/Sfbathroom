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
  ubicacion: string | null;
};

/** Alerta de rotura o necesidad de compra para un artículo. */
export type AlertaStock = {
  codigo: string;
  articulo: string;
  stock: number;
  punto: number;
  mediaDiaria: number;
  propuesta: number;
  rotura: boolean;
};

/** Agrupación por artículo: una cabecera con sus modelos/almacenes/lotes dentro. */
export type GrupoStock = {
  clave: string;
  nombre: string;
  unidades: number;
  valor: number;
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
  const [filas, almacenesRaw, artsRes, consumoRes] = await Promise.all([
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
  ]);

  const conStock = new Set<string>();
  const todasRefs = new Set<string>();
  let unidades = 0;
  let valor = 0;
  for (const f of filas) {
    todasRefs.add(f.articulo_codigo);
    const u = Number(f.unidades ?? 0);
    unidades += u;
    valor += u * Number(f.coste_medio ?? 0);
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
  for (const f of filas) {
    stockPorCodigo.set(f.articulo_codigo, (stockPorCodigo.get(f.articulo_codigo) ?? 0) + Number(f.unidades ?? 0));
  }

  const alertas: AlertaStock[] = [];
  for (const [codigo, stock] of stockPorCodigo) {
    const consumo = consumoPorCodigo.get(codigo) ?? 0;
    const media = consumo / 90;
    const punto = puntoPorCodigo.get(codigo) ?? 0;
    const propuesta = media > 0 ? Math.max(0, Math.round(media * 45 - stock)) : 0;
    const rotura = stock <= 0 && consumo > 0;
    if (!rotura && !(punto > 0 && stock < punto) && propuesta <= 0) continue;
    alertas.push({
      codigo,
      articulo: filas.find((f) => f.articulo_codigo === codigo)?.articulo_nombre ?? codigo,
      stock,
      punto,
      mediaDiaria: media,
      propuesta,
      rotura,
    });
  }
  alertas.sort((a, b) => Number(b.rotura) - Number(a.rotura) || b.propuesta - a.propuesta);

  const gruposMap = new Map<string, GrupoStock>();
  for (const f of filas) {
    const nombre = (f.articulo_nombre ?? '').trim() || f.articulo_codigo;
    const clave = nombre.toLocaleUpperCase('es');
    const g = gruposMap.get(clave) ?? { clave, nombre, unidades: 0, valor: 0, filas: [] };
    g.unidades += Number(f.unidades ?? 0);
    g.valor += Number(f.unidades ?? 0) * Number(f.coste_medio ?? 0);
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
    filas,
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
