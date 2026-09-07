import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type StockData = {
  empresa: { id: string; codigo: string; nombre: string };
  valorStock: number;
  valorTrasito: number;
  coberturaMedia: number;
  roturas: number;
  bajoPuntoPedido: number;
  bajoPunto: { articulo: string; almacen: string; disponible: number; punto: number; cobertura: number | null; transito: number }[];
  peorCobertura: { articulo: string; almacen: string; disponible: number; cobertura: number | null }[];
  aprovisionamiento: { articulo: string; almacen: string; disponible: number; mediaDiaria: number; transito: number; propuesta: number }[];
};

type FilaCobertura = {
  articulo_id: string;
  articulo: string;
  almacen: string;
  punto_pedido: number;
  stock_disponible: number;
  consumo_medio_diario: number;
  cobertura_dias: number | null;
  en_transito: number;
};

export const PLAZO_REPOSICION_DIAS = 60;
export const DIAS_SEGURIDAD = 15;

export async function getStock(codigoEmpresa: string): Promise<StockData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: filas } = await supabase
    .from('v_stock_cobertura')
    .select('articulo_id, articulo, almacen, punto_pedido, stock_disponible, consumo_medio_diario, cobertura_dias, en_transito')
    .eq('empresa_id', empresa.id);
  const rows = (filas ?? []) as FilaCobertura[];

  const { data: arts } = await supabase.from('articulos').select('id, coste_unitario').eq('empresa_id', empresa.id);
  const costeUnit = new Map<string, number>();
  for (const a of arts ?? []) {
    const costo = Number((a as { coste_unitario: number | null }).coste_unitario ?? 0);
    costeUnit.set((a as { id: string }).id, costo);
  }

  let valorStock = 0;
  let valorTrasito = 0;
  let coberturaSum = 0;
  let coberturaN = 0;
  const roturas = new Set<string>();
  const bajoPunto: StockData['bajoPunto'] = [];
  const peorCobertura: StockData['peorCobertura'] = [];
  const aprovisionamiento: StockData['aprovisionamiento'] = [];

  for (const r of rows) {
    const coste = costeUnit.get(r.articulo_id) ?? 0;
    valorStock += Number(r.stock_disponible ?? 0) * coste;
    valorTrasito += Number(r.en_transito ?? 0) * coste;
    const cobertura = r.cobertura_dias != null ? Number(r.cobertura_dias) : null;
    if (cobertura !== null) {
      coberturaSum += cobertura;
      coberturaN += 1;
    }
    const disponible = Number(r.stock_disponible ?? 0);
    const punto = Number(r.punto_pedido ?? 0);
    const mediaDiaria = Number(r.consumo_medio_diario ?? 0);
    const transito = Number(r.en_transito ?? 0);
    if (disponible <= 0) roturas.add(r.articulo_id);
    if (punto > 0 && disponible < punto) {
      bajoPunto.push({ articulo: r.articulo, almacen: r.almacen, disponible, punto, cobertura, transito });
    }
    peorCobertura.push({ articulo: r.articulo, almacen: r.almacen, disponible, cobertura });

    if (mediaDiaria > 0) {
      const propuesta = Math.max(
        0,
        Math.round(mediaDiaria * (PLAZO_REPOSICION_DIAS + DIAS_SEGURIDAD) - disponible - transito),
      );
      if (propuesta > 0) {
        aprovisionamiento.push({
          articulo: r.articulo,
          almacen: r.almacen,
          disponible,
          mediaDiaria,
          transito,
          propuesta,
        });
      }
    }
  }

  bajoPunto.sort((a, b) => a.disponible - b.disponible).slice(0, 15);
  peorCobertura
    .filter((x) => x.cobertura !== null)
    .sort((a, b) => (a.cobertura ?? Infinity) - (b.cobertura ?? Infinity))
    .slice(0, 12);
  aprovisionamiento.sort((a, b) => b.propuesta - a.propuesta).slice(0, 15);

  return {
    empresa,
    valorStock,
    valorTrasito,
    coberturaMedia: coberturaN > 0 ? coberturaSum / coberturaN : 0,
    roturas: roturas.size,
    bajoPuntoPedido: bajoPunto.length,
    bajoPunto,
    peorCobertura,
    aprovisionamiento,
  };
}