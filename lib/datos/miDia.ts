import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { netaDeDocumento } from '@/lib/datos/neta';

export type MiDia = {
  comercial: { nombre: string | null; cestaClientes: string[] };
  anio: number;
  clientesCargo: number;
  neta: number;
  facturas: number;
  ticketMedio: number;
  enRiesgo: { id: string; nombre: string; diasSin: number; ultimaFactura: string }[];
  ultimas: { id: string; nombre: string; fecha: string; importe: number }[];
  pendencias: { id: string; numero: string | null; fecha: string; importe: number; cliente: string }[];
};

const DIA = 86400000;

/** Vista "Mi día" para el rol comercial: solo los clientes de su cartera. */
export async function getMiDia(codigoEmpresa: string, anio: number): Promise<MiDia | null> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('role, comercial_id').eq('id', user.id).maybeSingle();
  if (perfil?.role !== 'comercial') return null;
  const comercialId = perfil.comercial_id as string | null;
  if (!comercialId) return null;

  const { data: comercial } = await supabase.from('comerciales').select('nombre').eq('id', comercialId).maybeSingle();

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('empresa_id', empresa.id)
    .eq('comercial_id', comercialId);
  const clientesCargo = (clientes ?? []) as { id: string; nombre: string }[];
  const ids = clientesCargo.map((c) => c.id);

  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, cliente_id, fecha, total, tipo_documento')
    .eq('empresa_id', empresa.id)
    .in('cliente_id', ids.slice(0, 150))
    .gte('fecha', `${anio - 1}-01-01`);
  const filas0 = (facturas ?? []) as { id: string; cliente_id: string | null; fecha: string; total: number; tipo_documento: string }[];

  let filas = filas0;
  if (ids.length > 150) {
    for (let i = 150; i < ids.length; i += 150) {
      const { data: extra } = await supabase
        .from('facturas')
        .select('id, cliente_id, fecha, total, tipo_documento')
        .eq('empresa_id', empresa.id)
        .in('cliente_id', ids.slice(i, i + 150))
        .gte('fecha', `${anio - 1}-01-01`);
      filas = [...filas, ...((extra ?? []) as typeof filas)];
    }
  }

  const delAnio = filas.filter((f) => f.fecha.slice(0, 4) === String(anio));
  const neta = delAnio.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const nFacturas = delAnio.filter((f) => f.tipo_documento !== 'abono').length;

  const nombreCliente = new Map(clientesCargo.map((c) => [c.id, c.nombre]));
  const fechasCliente = new Map<string, string[]>();
  for (const f of delAnio) {
    if (!f.cliente_id) continue;
    const arr = fechasCliente.get(f.cliente_id) ?? [];
    arr.push(f.fecha);
    fechasCliente.set(f.cliente_id, arr);
  }
  const hoy = Math.floor(Date.now() / DIA);
  const enRiesgo: MiDia['enRiesgo'] = [];
  for (const c of clientesCargo) {
    const fechas = fechasCliente.get(c.id);
    if (!fechas?.length) {
      enRiesgo.push({ id: c.id, nombre: c.nombre, diasSin: 999, ultimaFactura: 'sin compras' });
      continue;
    }
    const ultima = [...fechas].sort().reverse()[0];
    const diasSin = Math.round((hoy * DIA - Date.parse(ultima)) / DIA);
    if (diasSin > 60) enRiesgo.push({ id: c.id, nombre: c.nombre, diasSin, ultimaFactura: ultima });
  }
  enRiesgo.sort((a, b) => b.diasSin - a.diasSin);
  if (enRiesgo.length > 8) enRiesgo.length = 8;

  const ultimas = [...delAnio]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, 6)
    .map((f) => ({ id: f.id, nombre: nombreCliente.get(f.cliente_id ?? '') ?? '—', fecha: f.fecha, importe: Number(f.total ?? 0) }));

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id, numero_erp, fecha_entrada, importe, cliente_id')
    .eq('empresa_id', empresa.id)
    .eq('comercial_id', comercialId)
    .gte('fecha_entrada', `${anio}-01-01`)
    .in('estado', ['captado', 'aceptado'])
    .order('fecha_entrada', { ascending: true })
    .limit(8);
  const pendencias = ((pedidos ?? []) as { id: string; numero_erp: string | null; fecha_entrada: string; importe: number; cliente_id: string | null }[]).map((p) => ({
    id: p.id,
    numero: p.numero_erp ?? '—',
    fecha: p.fecha_entrada,
    importe: Number(p.importe ?? 0),
    cliente: nombreCliente.get(p.cliente_id ?? '') ?? '—',
  }));

  return {
    comercial: { nombre: comercial?.nombre ?? null, cestaClientes: clientesCargo.map((c) => c.id) },
    anio,
    clientesCargo: clientesCargo.length,
    neta,
    facturas: nFacturas,
    ticketMedio: nFacturas > 0 ? neta / nFacturas : 0,
    enRiesgo,
    ultimas,
    pendencias,
  };
}