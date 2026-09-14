import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { netaDeDocumento } from '@/lib/datos/neta';

export type FichaCliente = {
  cliente: {
    id: string;
    nombre: string;
    codigoErp: string | null;
    cif: string | null;
    provincia: string | null;
    pais: string | null;
    estado: string;
    fechaPrimerPedido: string | null;
    comercial: string | null;
    grupo: string | null;
  };
  anio: number;
  neta: number;
  netaPrevio: number;
  deltaPct: number | null;
  facturas: number;
  ticketMedio: number;
  unidades: number;
  saldo: number;
  vencido: number;
  dsoDias: number | null;
  historico: { mes: string; neta: number }[];
  ultimasFacturas: { id: string; fecha: string; numero: string | null; importe: number; tipo: string }[];
  topArticulos: { nombre: string; unidades: number; importe: number }[];
};

const MESES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};

export async function getFichaCliente(codigoEmpresa: string, clienteId: string, anio: number): Promise<FichaCliente | null> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: clienteRaw } = await supabase
    .from('clientes')
    .select('id, nombre, codigo_erp, cif, provincia, pais_facturacion, estado, fecha_primer_pedido, comercial_id, grupo_id')
    .eq('id', clienteId)
    .eq('empresa_id', empresa.id)
    .maybeSingle();
  if (!clienteRaw) return null;
  const c = clienteRaw as {
    id: string; nombre: string; codigo_erp: string | null; cif: string | null;
    provincia: string | null; pais_facturacion: string | null; estado: string;
    fecha_primer_pedido: string | null; comercial_id: string | null; grupo_id: string | null;
  };

  const [comercialRes, grupoRes] = await Promise.all([
    c.comercial_id
      ? supabase.from('comerciales').select('nombre').eq('id', c.comercial_id).maybeSingle()
      : Promise.resolve({ data: null }),
    c.grupo_id
      ? supabase.from('grupos_empresariales').select('nombre').eq('id', c.grupo_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, numero_erp, fecha, tipo_documento, total')
    .eq('empresa_id', empresa.id)
    .eq('cliente_id', clienteId)
    .gte('fecha', `${anio - 1}-01-01`);
  const filas = (facturas ?? []) as { id: string; numero_erp: string | null; fecha: string; tipo_documento: string; total: number }[];

  const delAnio = filas.filter((f) => f.fecha.slice(0, 4) === String(anio));
  const delPrevio = filas.filter((f) => f.fecha.slice(0, 4) === String(anio - 1));
  const neta = delAnio.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const netaPrevio = delPrevio.reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const facturasN = delAnio.filter((f) => f.tipo_documento !== 'abono').length;

  // histórico neto mensual (15 meses)
  const historico: FichaCliente['historico'] = [];
  const porMes = new Map<string, number>();
  const hace15 = new Date();
  hace15.setMonth(hace15.getMonth() - 14);
  hace15.setDate(1);
  for (const f of filas) {
    if (!f.fecha || f.fecha < hace15.toISOString().slice(0, 10)) continue;
    const clave = f.fecha.slice(0, 7);
    porMes.set(clave, (porMes.get(clave) ?? 0) + netaDeDocumento(f.tipo_documento, f.total));
  }
  const claves = [...porMes.keys()].sort();
  for (const clave of claves) {
    const [y, m] = clave.split('-');
    historico.push({ mes: `${MESES[m] ?? m} ${y.slice(2)}`, neta: porMes.get(clave) ?? 0 });
  }

  // unidades del año
  const facturasAnioIds = delAnio.filter((f) => f.tipo_documento === 'factura').map((f) => f.id);
  let unidades = 0;
  let topMap = new Map<string, { nombre: string; unidades: number; importe: number }>();
  for (let i = 0; i < facturasAnioIds.length; i += 150) {
    const lote = facturasAnioIds.slice(i, i + 150);
    const { data: lineas } = await supabase
      .from('factura_lineas')
      .select('cantidad, importe, articulo_id')
      .in('factura_id', lote);
    for (const l of (lineas ?? []) as { cantidad: number; importe: number; articulo_id: string | null }[]) {
      unidades += Number(l.cantidad ?? 0);
      if (l.articulo_id) {
        const a = topMap.get(l.articulo_id) ?? { nombre: '', unidades: 0, importe: 0 };
        a.unidades += Number(l.cantidad ?? 0);
        a.importe += Number(l.importe ?? 0);
        topMap.set(l.articulo_id, a);
      }
    }
  }
  const nombresArt = await supabase.from('articulos').select('id, nombre').in('id', [...topMap.keys()]);
  for (const a of (nombresArt.data ?? []) as { id: string; nombre: string }[]) {
    const t = topMap.get(a.id);
    if (t) t.nombre = a.nombre;
  }
  const topArticulos = [...topMap.values()]
    .filter((a) => a.nombre)
    .sort((a, b) => b.importe - a.importe)
    .slice(0, 10);

  // cartera: saldo + vencido + DSO client
  const { data: saldoRaw } = await supabase
    .from('v_saldo_clientes')
    .select('saldo_total, vencido')
    .eq('empresa_id', empresa.id)
    .eq('cliente_id', clienteId)
    .maybeSingle();
  const saldo = Number(saldoRaw?.saldo_total ?? 0);
  const vencido = Number(saldoRaw?.vencido ?? 0);

  const haceAnio = new Date();
  haceAnio.setFullYear(haceAnio.getFullYear() - 1);
  const neta12m = filas
    .filter((f) => f.fecha >= haceAnio.toISOString().slice(0, 10))
    .reduce((s, f) => s + netaDeDocumento(f.tipo_documento, f.total), 0);
  const dsoDias = neta12m > 0 ? saldo / (neta12m / 365) : null;

  const ultimas = [...filas]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, 8)
    .map((f) => ({ id: f.id, fecha: f.fecha, numero: f.numero_erp, importe: Number(f.total ?? 0), tipo: f.tipo_documento }));

  return {
    cliente: {
      id: c.id,
      nombre: c.nombre,
      codigoErp: c.codigo_erp,
      cif: c.cif,
      provincia: c.provincia,
      pais: c.pais_facturacion,
      estado: c.estado,
      fechaPrimerPedido: c.fecha_primer_pedido,
      comercial: (comercialRes.data as { nombre?: string } | null)?.nombre ?? null,
      grupo: (grupoRes.data as { nombre?: string } | null)?.nombre ?? null,
    },
    anio,
    neta,
    netaPrevio,
    deltaPct: netaPrevio > 0 ? ((neta - netaPrevio) / netaPrevio) * 100 : null,
    facturas: facturasN,
    ticketMedio: facturasN > 0 ? neta / facturasN : 0,
    unidades,
    saldo,
    vencido,
    dsoDias,
    historico,
    topArticulos,
    ultimasFacturas: ultimas,
  };
}