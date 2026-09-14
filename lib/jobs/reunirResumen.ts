import type { SupabaseClient } from '@supabase/supabase-js';
import { netaDeDocumento } from '@/lib/datos/neta';

const euroFmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const numFmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 });

/** Cifras base del resumen ejecutivo de una empresa para el ejercicio actual. */
export async function reunirResumen(supabase: SupabaseClient, empresaCodigo: string, anio: number) {
  const { data: empresaL } = await supabase.from('empresas').select('id, codigo, nombre').eq('codigo', empresaCodigo).maybeSingle();
  if (!empresaL) throw new Error(`Empresa no encontrada: ${empresaCodigo}`);

  const empId = (empresaL as { id: string }).id;

  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, fecha, tipo_documento, total, cliente_id')
    .eq('empresa_id', empId)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);

  const filas = (facturas ?? []) as { id: string; fecha: string; tipo_documento: string; total: number; cliente_id: string | null }[];
  const neta = filas.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const nFacturas = filas.filter((f) => f.tipo_documento !== 'abono').length;
  const clientesActivos = new Set(filas.filter((f) => f.cliente_id).map((f) => f.cliente_id)).size;
  const ticketMedio = nFacturas > 0 ? neta / nFacturas : 0;

  // Facturas previas (año anterior) para Δ
  const { data: previas } = await supabase
    .from('facturas')
    .select('tipo_documento, total')
    .eq('empresa_id', empId)
    .gte('fecha', `${anio - 1}-01-01`)
    .lte('fecha', `${anio - 1}-12-31`);
  const netaPrevio = (previas ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);

  // Unidades (factura_lineas)
  const lineasIds = filas.filter((f) => f.tipo_documento === 'factura').map((f) => f.id);
  let unidades = 0;
  for (let i = 0; i < lineasIds.length; i += 150) {
    const lote = lineasIds.slice(i, i + 150);
    const { data: lineas } = await supabase.from('factura_lineas').select('cantidad').in('factura_id', lote);
    unidades += (lineas ?? []).reduce((s: number, l: { cantidad: number }) => s + Number(l.cantidad ?? 0), 0);
  }

  // Cumplimiento presupuesto
  const { data: presupuesto } = await supabase
    .from('presupuesto')
    .select('importe')
    .eq('empresa_id', empId)
    .eq('ejercicio', anio);
  const presupuestoTotal = (presupuesto ?? []).reduce((s: number, r: { importe: number }) => s + Number(r.importe ?? 0), 0);
  const cumplimiento = presupuestoTotal > 0 ? (neta / presupuestoTotal) * 100 : null;

  // DSO y vencido: v_aging
  const { data: aging } = await supabase.from('v_aging').select('pendiente, dias_mora').eq('empresa_id', empId);
  const saldoAbierto = (aging ?? []).reduce((s: number, r: { pendiente: number }) => s + Number(r.pendiente ?? 0), 0);
  const vencido = (aging ?? []).reduce((s: number, r: { pendiente: number; dias_mora: number }) => s + (r.dias_mora > 0 ? Number(r.pendiente ?? 0) : 0), 0);
  const haceAnio = new Date(); haceAnio.setFullYear(haceAnio.getFullYear() - 1);
  const { data: ventas12m } = await supabase
    .from('facturas')
    .select('tipo_documento, total')
    .eq('empresa_id', empId)
    .gte('fecha', haceAnio.toISOString().slice(0, 10));
  const neta12m = (ventas12m ?? []).reduce((s: number, f: { tipo_documento: string; total: number }) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const dso = neta12m > 0 ? saldoAbierto / (neta12m / 365) : null;

  // Fugas: cliente activo que no ha facturado este año
  const { data: clientesActivos12m } = await supabase
    .from('clientes')
    .select('id')
    .eq('empresa_id', empId)
    .eq('estado', 'activo');
  const clientesSet = new Set(filas.filter((f) => f.cliente_id).map((f) => f.cliente_id ?? ''));
  const enFuga = (clientesActivos12m ?? []).filter((c) => !clientesSet.has((c as { id: string }).id)).length;

  return {
    empresa: (empresaL as { nombre: string }).nombre,
    anio,
    neta,
    netaPrevio,
    deltaPct: netaPrevio > 0 ? ((neta - netaPrevio) / netaPrevio) * 100 : null,
    unidades,
    nFacturas,
    numClientes: clientesActivos,
    ticketMedio,
    cumplimiento,
    dso,
    vencido,
    enFuga,
    netaFmt: euroFmt(neta),
    ticketFmt: euroFmt(ticketMedio),
    unidadesFmt: numFmt(unidades),
  };
}

export function plantillaResumen(datos: Record<string, unknown>) {
  const d = datos;
  const anio = Number(d.anio ?? new Date().getFullYear());
  const netaFmt = (d.netaFmt as string) ?? String(d.neta);
  const ticketFmt = (d.ticketFmt as string) ?? String(d.ticketMedio);
  const unidadesFmt = (d.unidadesFmt as string) ?? String(d.unidades);
  const numClientes = Number(d.numClientes ?? 0).toLocaleString('es-ES');
  const deltaPct = d.deltaPct == null ? null : Number(d.deltaPct);
  const cumplimiento = d.cumplimiento == null ? null : Number(d.cumplimiento);
  const dso = d.dso == null ? null : Number(d.dso);

  const l: string[] = [];
  l.push(`Facturación neta ${anio}: ${netaFmt}${deltaPct != null ? ` (Δ vs ${anio - 1}: ${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}.`);
  l.push(`Ticket medio: ${ticketFmt}. Clientes activos: ${numClientes}.`);
  l.push(`Unidades facturadas: ${unidadesFmt}.`);
  if (cumplimiento != null) l.push(`Cumplimiento: ${cumplimiento.toFixed(1)}% de presupuesto.`);
  if (dso != null) l.push(`DSO: ${dso.toFixed(0)} días; vencido ${euroFmt(Number(d.vencido ?? 0))}.`);
  if (Number(d.enFuga) > 0) l.push(`Atención: ${d.enFuga} cliente(s) activos sin compras este año.`);
  return l.join(' ');
}