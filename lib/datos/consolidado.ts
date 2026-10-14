import { createClient } from '@/lib/supabase/server';
import { netaDeDocumento } from '@/lib/datos/neta';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';

export type ConsolidadoEmpresa = {
  codigo: string;
  nombre: string;
  neta: number;
  facturas: number;
  conDatos: boolean;
};

export type Consolidado = {
  anio: number;
  porEmpresa: ConsolidadoEmpresa[];
  totalNeta: number;
  totalFacturas: number;
  empresasConDatos: number;
};

const TIPOS_NETA = ['factura', 'abono', 'nota_cargo'];

/**
 * Facturación neta consolidada del grupo (todas las empresas del holding):
 * suma las facturas de A3ERP de cada empresa para el ejercicio. La RLS decide
 * qué empresas ve cada rol; para los que solo ven la suya, el total coincide
 * con su empresa seleccionada.
 *
 * Usa la vista agregada `v_perf_facturacion_mensual` (neta total = facturas +
 * notas de cargo − abonos) y, si no estuviera disponible, cae a sumar las
 * facturas del ejercicio a mano.
 */
export async function getConsolidado(anio: number): Promise<Consolidado> {
  const supabase = createClient();
  const { data: empresasRaw } = await supabase.from('empresas').select('id, codigo, nombre');
  const empresas = (empresasRaw ?? []) as { id: string; codigo: string; nombre: string }[];

  const acc = new Map<string, { neta: number; facturas: number }>();

  const { data: vista, error: vistaError } = await supabase
    .from('v_perf_facturacion_mensual')
    .select('empresa_id, neta_total, n_facturas')
    .eq('ejercicio', anio);

  if (!vistaError && Array.isArray(vista)) {
    for (const v of vista as { empresa_id: string; neta_total: number | null; n_facturas: number | null }[]) {
      const a = acc.get(v.empresa_id) ?? { neta: 0, facturas: 0 };
      a.neta += Number(v.neta_total ?? 0);
      a.facturas += Number(v.n_facturas ?? 0);
      acc.set(v.empresa_id, a);
    }
  } else {
    const filas = await todasLasFilas<{ empresa_id: string; tipo_documento: string; base_imponible: number | null }>(
      (desde) =>
        supabase
          .from('facturas')
          .select('empresa_id, tipo_documento, base_imponible')
          .in('tipo_documento', TIPOS_NETA)
          .gte('fecha', `${anio}-01-01`)
          .lte('fecha', `${anio}-12-31`)
          .range(desde, desde + TAMANO_PAGINA - 1),
    );
    for (const f of filas) {
      if (!f.empresa_id) continue;
      const a = acc.get(f.empresa_id) ?? { neta: 0, facturas: 0 };
      a.neta += netaDeDocumento(f.tipo_documento, Number(f.base_imponible ?? 0));
      if (f.tipo_documento === 'factura') a.facturas += 1;
      acc.set(f.empresa_id, a);
    }
  }

  const porEmpresa: ConsolidadoEmpresa[] = empresas
    .map((e) => {
      const a = acc.get(e.id);
      return {
        codigo: e.codigo,
        nombre: e.nombre,
        neta: a?.neta ?? 0,
        facturas: a?.facturas ?? 0,
        conDatos: !!a && a.facturas > 0,
      };
    })
    .sort((a, b) => b.neta - a.neta);

  const totalNeta = porEmpresa.reduce((s, e) => s + e.neta, 0);
  const totalFacturas = porEmpresa.reduce((s, e) => s + e.facturas, 0);

  return {
    anio,
    porEmpresa,
    totalNeta,
    totalFacturas,
    empresasConDatos: porEmpresa.filter((e) => e.conDatos).length,
  };
}
