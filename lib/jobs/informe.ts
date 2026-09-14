import type { SupabaseClient } from '@supabase/supabase-js';
import { netaDeDocumento } from '@/lib/datos/neta';

export type DatosInforme = {
  empresa: string;
  periodo: string;
  neta: number;
  netaPrevio: number;
  deltaPct: number | null;
  ticketMedio: number;
  clientesActivos: number;
  cumplimiento: number | null;
  dso: number | null;
  vencido: number;
  topClientes: { nombre: string; neta: number }[];
  atenciones: string[];
};

const euro = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Recopila los datos del informe semanal por empresa (service_role). */
export async function reunirInforme(supabase: SupabaseClient, empresaCodigo: string, anio: number, clavePeriodo: string): Promise<DatosInforme | null> {
  const { data: empresaL } = await supabase.from('empresas').select('id, codigo, nombre').eq('codigo', empresaCodigo).maybeSingle();
  if (!empresaL) return null;
  const empId = (empresaL as any).id as string;

  const { data: facturas } = await supabase
    .from('facturas')
    .select('tipo_documento, total, fecha, cliente_id')
    .eq('empresa_id', empId)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const filas = (facturas ?? []) as { tipo_documento: string; total: number; fecha: string; cliente_id: string | null }[];

  const neta = filas.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const nFacturas = filas.filter((f) => f.tipo_documento !== 'abono').length;
  const clientesActivos = new Set(filas.filter((f) => f.cliente_id).map((f) => f.cliente_id)).size;
  const ticketMedio = nFacturas > 0 ? neta / nFacturas : 0;

  const { data: previas } = await supabase
    .from('facturas')
    .select('tipo_documento, total')
    .eq('empresa_id', empId)
    .gte('fecha', `${anio - 1}-01-01`)
    .lte('fecha', `${anio - 1}-12-31`);
  const netaPrevio = (previas ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const deltaPct = netaPrevio > 0 ? ((neta - netaPrevio) / netaPrevio) * 100 : null;

  const { data: presupuesto } = await supabase.from('presupuesto').select('importe').eq('empresa_id', empId).eq('ejercicio', anio);
  const presupuestoTotal = (presupuesto ?? []).reduce((s: number, r: { importe: number }) => s + Number(r.importe ?? 0), 0);
  const cumplimiento = presupuestoTotal > 0 ? (neta / presupuestoTotal) * 100 : null;

  const { data: aging } = await supabase.from('v_aging').select('pendiente, dias_mora').eq('empresa_id', empId);
  const saldo = (aging ?? []).reduce((s: number, r: { pendiente: number }) => s + Number(r.pendiente ?? 0), 0);
  const vencido = (aging ?? []).reduce((s: number, r: { pendiente: number; dias_mora: number }) => s + (r.dias_mora > 0 ? Number(r.pendiente ?? 0) : 0), 0);
  const haceAnio = new Date();
  haceAnio.setFullYear(haceAnio.getFullYear() - 1);
  const { data: ventas12m } = await supabase.from('facturas').select('tipo_documento, total').eq('empresa_id', empId).gte('fecha', haceAnio.toISOString().slice(0, 10));
  const neta12m = (ventas12m ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const dso = neta12m > 0 ? saldo / (neta12m / 365) : null;

  const porCliente = new Map<string, number>();
  for (const f of filas) {
    if (!f.cliente_id) continue;
    porCliente.set(f.cliente_id, (porCliente.get(f.cliente_id) ?? 0) + netaDeDocumento(f.tipo_documento, f.total));
  }
  const topIds = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', topIds);
  const nombreCliente = new Map((clis ?? [] as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]));
  const topClientes = [...porCliente.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, v]) => ({ nombre: nombreCliente.get(id) ?? '—', neta: v }));

  const atenciones: string[] = [];
  if (deltaPct != null && deltaPct < -10) atenciones.push(`Facturación ${Math.abs(deltaPct).toFixed(0)} % por debajo de ${anio - 1}.`);
  if (dso != null && dso > 60) atenciones.push(`DSO de ${Math.round(dso)} días con ${euro(vencido)} vencido.`);
  if (clientesActivos > 0 && nFacturas === 0) atenciones.push('Sin facturas en el ejercicio.');

  return { empresa: (empresaL as any).nombre, periodo: clavePeriodo, neta, netaPrevio, deltaPct, ticketMedio, clientesActivos, cumplimiento, dso, vencido, topClientes, atenciones };
}

/** Renderiza el informe semanal como email HTML autocontenido (estilos inline). */
export function renderInformeHtml(d: DatosInforme): string {
  const fila = (label: string, valor: string, nota: string) =>
    `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee;color:#334862;font-weight:600">${label}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${valor}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;color:#9aa0a6;font-size:12px">${nota}</td></tr>`;

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f7;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:640px;margin:auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e7e9ec">
<div style="background:#334862;color:#fff;padding:18px 24px">
  <div style="font-size:20px;font-weight:700">Informe semanal · ${d.empresa}</div>
  <div style="font-size:12px;opacity:.8">${d.periodo} · Generado automáticamente por sfbathroom BI</div>
</div>
<div style="padding:24px">
  <table width="100%" style="border-collapse:collapse">
    ${fila(`Facturación neta ${new Date().getFullYear()}`, euro(d.neta), d.deltaPct != null ? (d.deltaPct > 0 ? `+${d.deltaPct.toFixed(1)} % vs ` : `${d.deltaPct.toFixed(1)} % vs `) + `${new Date().getFullYear() - 1}` : 'sin dato previo')}
    ${fila('Ticket medio', euro(d.ticketMedio), 'por factura')}
    ${fila('Clientes activos', String(d.clientesActivos), 'en el ejercicio')}
    ${fila('Cumplimiento presupuesto', d.cumplimiento != null ? `${d.cumplimiento.toFixed(1)} %` : '—', d.cumplimiento != null ? 'sobre presupuesto' : 'sin presupuesto')}
    ${fila('DSO', d.dso != null ? `${Math.round(d.dso)} días` : '—', `${euro(d.vencido)} vencido`)}
  </table>

  <div style="margin-top:22px;font-weight:700;color:#334862">Top clientes</div>
  <table width="100%" style="border-collapse:collapse;margin-top:6px">
    ${d.topClientes.map((c, i) => fila(`${i + 1}. ${c.nombre}`, euro(c.neta), '')).join('')}
  </table>

  ${d.atenciones.length ? `
  <div style="margin-top:22px;font-weight:700;color:#b23b3b">Requiere atención</div>
  <ul style="margin-top:6px;color:#334862;font-size:14px;line-height:1.6;padding-left:20px">
    ${d.atenciones.map((a) => `<li>${a}</li>`).join('')}
  </ul>` : ''}

  <div style="margin-top:24px;font-size:11px;color:#9aa0a6">Datos con RLS por rol y empresa. Informe en vivo desde Supabase.</div>
</div>
</div></body></html>`;
}