import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type FilaDiaria = { fecha: string; neta: number; facturas: number };
export type FilaSemanal = { semana: string; neta: number; facturas: number };
export type FilaRodante = { mes: string; neta: number };

export type VistasData = {
  diaria: FilaDiaria[];
  semanal: FilaSemanal[];
  rodante12m: FilaRodante[];
  proyeccion: {
    anio: number;
    ytd: number;
    ritmoDiario: number;
    diasRestantes: number;
    proyectado: number;
    presupuesto: number;
    cumplimientoProyectado: number | null;
  };
};

const DIA_MS = 86400000;
const TIPOS_NETA = new Set(['factura', 'abono', 'nota_cargo']);

function getISOWeek(fecha: string): number {
  const date = new Date(`${fecha}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / DIA_MS) + 1) / 7);
}

export async function getVistasTemporales(codigoEmpresa: string, anio: number): Promise<VistasData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const hoy = new Date();
  const hoyIso = hoy.toISOString().slice(0, 10);
  const desdeIso = new Date(Date.now() - 395 * DIA_MS).toISOString().slice(0, 10);

  const { data: filas } = await supabase
    .from('facturas')
    .select('fecha, tipo_documento, total')
    .eq('empresa_id', empresa.id)
    .in('tipo_documento', [...TIPOS_NETA])
    .gte('fecha', desdeIso)
    .lte('fecha', hoyIso);
  const facturas = (filas ?? []) as { fecha: string; tipo_documento: string; total: number }[];

  const neta = (f: { fecha: string; tipo_documento: string; total: number }) => {
    const total = Number(f.total ?? 0);
    return f.tipo_documento === 'factura' || f.tipo_documento === 'nota_cargo' ? total : -total;
  };

  const diaria = new Map<string, FilaDiaria>();
  const semanal = new Map<string, FilaSemanal>();
  const rodante = new Map<string, number>();
  let ytd = 0;
  let facturasActivo = 0;

  for (const f of facturas) {
    const importe = neta(f);
    const d = diaria.get(f.fecha) ?? { fecha: f.fecha, neta: 0, facturas: 0 };
    d.neta += importe;
    if (f.tipo_documento === 'factura') d.facturas += 1;
    diaria.set(f.fecha, d);

    const iso = getISOWeek(f.fecha);
    const claveSemana = `${f.fecha.slice(0, 4)}-W${String(iso).padStart(2, '0')}`;
    const s = semanal.get(claveSemana) ?? { semana: claveSemana, neta: 0, facturas: 0 };
    s.neta += importe;
    if (f.tipo_documento === 'factura') s.facturas += 1;
    semanal.set(claveSemana, s);

    rodante.set(f.fecha.slice(0, 7), (rodante.get(f.fecha.slice(0, 7)) ?? 0) + importe);

    if (f.fecha.slice(0, 4) === String(anio)) {
      ytd += importe;
      if (f.tipo_documento === 'factura') facturasActivo += 1;
    }
  }

  const diasTranscurridos = Math.floor((Date.parse(hoyIso) - Date.parse(`${anio}-01-01`)) / DIA_MS) + 1;
  const diasEnAnio = (anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)) ? 366 : 365;
  const ritmoDiario = ytd / diasTranscurridos;
  const diasRestantes = diasEnAnio - diasTranscurridos;
  const proyectado = ritmoDiario * diasEnAnio;

  const { data: presupuestoRaw } = await supabase
    .from('presupuesto')
    .select('importe')
    .eq('empresa_id', empresa.id)
    .eq('ejercicio', anio);
  let presupuesto = 0;
  for (const p of presupuestoRaw ?? []) presupuesto += Number((p as { importe: number }).importe ?? 0);

  return {
    diaria: [...diaria.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).slice(-30),
    semanal: [...semanal.values()].sort((a, b) => (a.semana < b.semana ? -1 : 1)).slice(-12),
    rodante12m: [...rodante.entries()]
      .map(([mes, total]) => ({ mes, neta: total }))
      .sort((a, b) => (a.mes < b.mes ? -1 : 1))
      .slice(-12),
    proyeccion: {
      anio,
      ytd,
      ritmoDiario,
      diasRestantes,
      proyectado,
      presupuesto,
      cumplimientoProyectado: presupuesto > 0 ? (proyectado / presupuesto) * 100 : null,
    },
  };
}