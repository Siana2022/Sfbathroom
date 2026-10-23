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
  fecha_caducidad: string | null;
  ubicacion: string | null;
};

export type StockAlmacenResumen = {
  empresa: { codigo: string; nombre: string };
  filas: FilaStockAlmacen[];
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
        'articulo_codigo, articulo_nombre, almacen_codigo, almacen_nombre, lote, unidades, coste_medio, fecha_caducidad, ubicacion',
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

  const [filas, almacenesRaw] = await Promise.all([
    todasLasFilas<FilaStockAlmacen>(construir),
    todasLasFilas<{ almacen_codigo: string; almacen_nombre: string | null }>((desde) =>
      supabase
        .from('stock_almacen')
        .select('almacen_codigo, almacen_nombre')
        .eq('empresa_id', empresa.id)
        .order('almacen_codigo')
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

  return {
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    filas,
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
