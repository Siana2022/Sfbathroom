import type { SupabaseClient } from '@supabase/supabase-js';
import { netaDeDocumento } from '@/lib/datos/neta';

export type Anomalia = {
  tipo: string;
  severidad: 'aviso' | 'critico';
  mensaje: string;
  importe?: number;
  referencia?: string;
};

const UMBRAL_CAIDA_MES = 25;   // % caída vs mismo mes del año previo
const UMBRAL_CAIDA_TICKET = 20;
const UMBRAL_DSO = 60;         // días

/**
 * Anomalías heurísticas por empresa: compara el mes en curso (o último mes completo)
 * con el mismo mes del ejercicio anterior, más cruces de DSO y desaparecidos.
 */
export async function detectarAnomalias(supabase: SupabaseClient, empresaId: string): Promise<Anomalia[]> {
  const anomalias: Anomalia[] = [];

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mesActual = hoy.getMonth(); // 0..11
  const mesCompara = mesActual - 1; // último mes completo, robusto a mitad de mes

  const claveMes = (mes: number) => new Date(anio, mes, 1).toISOString().slice(0, 7);
  const claveMesPrevio = (mes: number) => new Date(anio - 1, mes, 1).toISOString().slice(0, 7);

  if (mesCompara >= 0) {
    const desde = `${claveMes(mesCompara)}-01`;
    const hasta = `${new Date(anio, mesCompara + 1, 0).toISOString().slice(0, 10)}`;
    const desdePrev = `${claveMesPrevio(mesCompara)}-01`;
    const hastaPrev = `${new Date(anio - 1, mesCompara + 1, 0).toISOString().slice(0, 10)}`;

    const { data: facturas } = await supabase
      .from('facturas')
      .select('tipo_documento, total, fecha')
      .eq('empresa_id', empresaId)
      .gte('fecha', desdePrev)
      .lte('fecha', hasta);

    const filas = (facturas ?? []) as { tipo_documento: string; total: number; fecha: string }[];
    const enMes = (clave: string) => filas.filter((f) => f.fecha.slice(0, 7) === clave);

    const neta = (fs: { tipo_documento: string; total: number }[]) => fs.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
    const netaMes = neta(enMes(claveMes(mesCompara)));
    const netaPrev = neta(enMes(claveMesPrevio(mesCompara)));

    if (netaPrev > 0 && netaMes < netaPrev * (1 - UMBRAL_CAIDA_MES / 100)) {
      anomalias.push({
        tipo: 'caida_facturacion',
        severidad: netaMes < netaPrev * 0.5 ? 'critico' : 'aviso',
        mensaje: `Caída de facturación ${(netaPrev - netaMes).toLocaleString('es-ES')} € (${Math.round((1 - netaMes / netaPrev) * 100)} %) en ${claveMes(mesCompara)} frente a ${claveMesPrevio(mesCompara)}.`,
        importe: netaPrev - netaMes,
        referencia: claveMes(mesCompara),
      });
    }

    // ticket medio mensual
    const nF = (fs: { tipo_documento: string }[]) => fs.filter((f) => f.tipo_documento !== 'abono').length;
    const tMes = nF(enMes(claveMes(mesCompara)));
    const tPrev = nF(enMes(claveMesPrevio(mesCompara)));
    const ticketMes = tMes > 0 ? netaMes / tMes : 0;
    const ticketPrev = tPrev > 0 ? netaPrev / tPrev : 0;
    if (ticketPrev > 0 && ticketMes > 0 && ticketMes < ticketPrev * (1 - UMBRAL_CAIDA_TICKET / 100)) {
      anomalias.push({
        tipo: 'caida_ticket',
        severidad: 'aviso',
        mensaje: `Ticket medio ${Math.round((1 - ticketMes / ticketPrev) * 100)} % menor que en ${claveMesPrevio(mesCompara)} (${Math.round(ticketMes).toLocaleString('es-ES')} € vs ${Math.round(ticketPrev).toLocaleString('es-ES')} €).`,
        referencia: claveMes(mesCompara),
      });
    }
  }

  // DSO
  const { data: saldoRaw } = await supabase
    .from('v_saldo_clientes')
    .select('saldo_total')
    .eq('empresa_id', empresaId);
  const saldoTotal = (saldoRaw ?? []).reduce((s: number, r: { saldo_total: number }) => s + Number(r.saldo_total ?? 0), 0);
  const haceAnio = new Date();
  haceAnio.setFullYear(haceAnio.getFullYear() - 1);
  const { data: neta12 } = await supabase
    .from('facturas')
    .select('tipo_documento, total')
    .eq('empresa_id', empresaId)
    .gte('fecha', haceAnio.toISOString().slice(0, 10));
  const neta12m = (neta12 ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const dso = neta12m > 0 ? saldoTotal / (neta12m / 365) : null;
  if (dso !== null && dso > UMBRAL_DSO) {
    anomalias.push({
      tipo: 'dso_alto',
      severidad: dso > UMBRAL_DSO * 2 ? 'critico' : 'aviso',
      mensaje: `DSO de ${Math.round(dso)} días, por encima del umbral de ${UMBRAL_DSO} días (saldo abierto ${saldoTotal.toLocaleString('es-ES')} €).`,
      importe: saldoTotal,
      referencia: 'DSO',
    });
  }

  return anomalias;
}