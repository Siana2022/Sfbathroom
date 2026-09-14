import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { evaluarKpi } from '@/lib/datos/kpiEval';
import { FORMATOS, type KpiConfig } from '@/lib/datos/kpisCatalogo';

export type KpiPersonalizadoVisto = {
  id: string;
  nombre: string;
  metrica: string;
  calculo: string;
  objetivo: number | null;
  objetivo_op: string;
  valor: number | null;
  formato: keyof typeof FORMATOS;
  fmt: string;
  estaBueno: boolean | null;
};

export async function getKpisPersonalizadosVistos(codigoEmpresa: string): Promise<KpiPersonalizadoVisto[]> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data } = await supabase
    .from('kpis_personalizados')
    .select('*')
    .eq('empresa_id', empresa.id)
    .order('orden')
    .order('created_at');

  const filas = (data ?? []) as (KpiConfig & { id: string })[];
  const vistos = await Promise.all(
    filas.map(async (k) => {
      let valor: number | null = null;
      try {
        valor = (await evaluarKpi(k, codigoEmpresa)).valor;
      } catch {
        valor = null;
      }
      const formato = k.formato as keyof typeof FORMATOS;
      const f = FORMATOS[formato] ?? FORMATOS.numero;
      const estaBueno = valor != null && k.objetivo != null
        ? (k.objetivo_op === 'gte' ? valor >= k.objetivo : valor <= k.objetivo)
        : null;
      return {
        id: k.id,
        nombre: k.nombre,
        metrica: k.metrica,
        calculo: k.calculo,
        objetivo: k.objetivo ?? null,
        objetivo_op: k.objetivo_op ?? 'gte',
        valor,
        formato,
        fmt: valor != null ? f.fmt(valor) : '—',
        estaBueno,
      };
    }),
  );
  return vistos;
}