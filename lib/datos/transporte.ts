import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type CosteTransporte = {
  total: number;
  flete: number;
  aduana: number;
  seguro: number;
  transporteInterior: number;
  compras: number;
  pesoSobreImporte: number | null;
};

type FilaCompra = {
  fecha: string;
  flete: number;
  aduana: number;
  seguro: number;
  transporte_interior: number;
};

export async function getCosteTransporte(codigoEmpresa: string, anio: number): Promise<CosteTransporte> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data } = await supabase
    .from('compras')
    .select('fecha, flete, aduana, seguro, transporte_interior')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const filas = (data ?? []) as FilaCompra[];

  let flete = 0;
  let aduana = 0;
  let seguro = 0;
  let transporteInterior = 0;
  for (const f of filas) {
    flete += Number(f.flete ?? 0);
    aduana += Number(f.aduana ?? 0);
    seguro += Number(f.seguro ?? 0);
    transporteInterior += Number(f.transporte_interior ?? 0);
  }
  const total = flete + aduana + seguro + transporteInterior;

  if (total === 0) return { total, flete, aduana, seguro, transporteInterior, compras: filas.length, pesoSobreImporte: null };

  const { data: netaRaw } = await supabase
    .from('facturas')
    .select('total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  let neta = 0;
  for (const f of netaRaw ?? []) neta += Number((f as { total: number }).total ?? 0);

  let importeCompras = 0;
  const { data: comprasIds } = await supabase
    .from('compras')
    .select('id')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const ids = (comprasIds ?? []).map((c) => (c as { id: string }).id);
  if (ids.length) {
    const { data: lineas } = await supabase
      .from('compra_lineas')
      .select('cantidad, coste_unitario_compra')
      .in('compra_id', ids);
    for (const l of lineas ?? []) {
      importeCompras += Number((l as { cantidad: number }).cantidad ?? 0) * Number((l as { coste_unitario_compra: number }).coste_unitario_compra ?? 0);
    }
  }

  return {
    total,
    flete,
    aduana,
    seguro,
    transporteInterior,
    compras: filas.length,
    pesoSobreImporte: (importeCompras > 0 ? (total / importeCompras) * 100 : 0) || null,
  };
}