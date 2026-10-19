import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type TransporteCalculado = {
  anio: number;
  total: number;
  flete: number;
  aduana: number;
  seguro: number;
  transporteInterior: number;
  compras: number;
  pesoSobreImporte: number;
};

export async function getCosteTransporte(codigoEmpresa: string, anio: number): Promise<TransporteCalculado> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data, error } = await supabase
    .from('v_coste_transporte_anual')
    .select('anio, categoria, total_base, total_importe')
    .eq('empresa_id', empresa.id)
    .eq('anio', anio);

  let flete = 0;
  let aduana = 0;
  let transporteInterior = 0;

  if (!error && data) {
    for (const r of data as any[]) {
      const importe = Number(r.total_importe ?? r.total_base ?? 0);
      if (r.categoria === 'fletes') flete += importe;
      else if (r.categoria === 'aduanas') aduana += importe;
      else if (r.categoria === 'transporte_interior') transporteInterior += importe;
    }
  }

  const total = flete + aduana + transporteInterior;

  return {
    anio,
    total,
    flete,
    aduana,
    seguro: 0, // agrupado o cero si no se separa
    transporteInterior,
    compras: (data ?? []).length,
    pesoSobreImporte: 0,
  };
}
