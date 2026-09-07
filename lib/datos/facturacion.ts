import { createClient } from '@/lib/supabase/server';

export type EmpresaSel = { id: string; codigo: string; nombre: string };

export type SerieMes = {
  mes: number;
  neta: number;
  unidades: number;
  facturas: number;
  presupuesto: number | null;
  netaPrevio: number | null;
};

export type ClienteTop = { id: string; nombre: string; neta: number };

export type FacturacionData = {
  empresa: EmpresaSel;
  anio: number;
  anioPrevio: number;
  neta: number;
  netaPrevioTotal: number;
  unidades: number;
  abonosYNotas: number;
  nFacturas: number;
  ticketMedio: number;
  precioMedio: number;
  presupuesto: number;
  cumplimiento: number | null;
  series: SerieMes[];
  topClientes: ClienteTop[];
};

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const TIPOS_UNIDADES = new Set(['factura']);

type FilaFactura = { id: string; cliente_id: string | null; fecha: string; tipo_documento: string; total: number };
type FilaLinea = { factura_id: string; cantidad: number };

export async function getEmpresaPorCodigo(codigo: string): Promise<EmpresaSel> {
  const supabase = createClient();
  const { data } = await supabase
    .from('empresas')
    .select('id, codigo, nombre')
    .eq('codigo', codigo)
    .maybeSingle();
  if (data) return data as EmpresaSel;
  const { data: defecto } = await supabase
    .from('empresas')
    .select('id, codigo, nombre')
    .eq('codigo', 'SF')
    .maybeSingle();
  return (defecto as EmpresaSel) ?? { id: '', codigo: 'SF', nombre: 'SF Bathroom' };
}

export async function getFacturacion(codigoEmpresa: string, anio: number): Promise<FacturacionData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;
  const at = String(anio);

  const { data: filas } = await supabase
    .from('facturas')
    .select('id, cliente_id, fecha, tipo_documento, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anioPrevio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const facturas = (filas ?? []) as FilaFactura[];

  const curs = { neta: 0, unidades: 0, facturas: 0, abonosYNotas: 0 };
  const prev = { neta: 0, unidades: 0, facturas: 0 };

  const mesDeLaFactura = new Map<string, number>();
  const idsActivo: string[] = [];
  const idsPrevio: string[] = [];

  const netaMesCur = new Map<number, number>();
  const netaMesPrev = new Map<number, number>();
  const facturasMesCur = new Map<number, number>();
  const porCliente = new Map<string, number>();

  for (const f of facturas) {
    const esActual = f.fecha.slice(0, 4) === at;
    const mes = Number(f.fecha.slice(5, 7));
    const total = Number(f.total ?? 0);
    if (esActual) {
      curs.neta += total;
      netaMesCur.set(mes, (netaMesCur.get(mes) ?? 0) + total);
      if (TIPOS_UNIDADES.has(f.tipo_documento)) {
        curs.facturas += 1;
        facturasMesCur.set(mes, (facturasMesCur.get(mes) ?? 0) + 1);
        idsActivo.push(f.id);
        mesDeLaFactura.set(f.id, mes);
        if (f.cliente_id) porCliente.set(f.cliente_id, (porCliente.get(f.cliente_id) ?? 0) + total);
      } else {
        curs.abonosYNotas += 1;
      }
    } else {
      prev.neta += total;
      netaMesPrev.set(mes, (netaMesPrev.get(mes) ?? 0) + total);
      if (TIPOS_UNIDADES.has(f.tipo_documento)) {
        prev.facturas += 1;
        idsPrevio.push(f.id);
        mesDeLaFactura.set(f.id, mes);
      }
    }
  }

  const unidadesMes = new Map<number, number>();
  const unidadesMesPrev = new Map<number, number>();
  if (idsActivo.length || idsPrevio.length) {
    const { data: lineas } = await supabase
      .from('factura_lineas')
      .select('factura_id, cantidad')
      .in('factura_id', [...idsActivo, ...idsPrevio]);
    const setActivo = new Set(idsActivo);
    for (const l of (lineas ?? []) as FilaLinea[]) {
      const cant = Number(l.cantidad ?? 0);
      const mes = mesDeLaFactura.get(l.factura_id);
      if (setActivo.has(l.factura_id)) {
        curs.unidades += cant;
        if (mes && mes <= 12) {
          unidadesMes.set(mes, (unidadesMes.get(mes) ?? 0) + cant);
        }
      } else if (mes && mes <= 12) {
        prev.unidades += cant;
        unidadesMesPrev.set(mes, (unidadesMesPrev.get(mes) ?? 0) + cant);
      }
    }
  }

  const { data: presupuestoFilas } = await supabase
    .from('presupuesto')
    .select('mes, importe')
    .eq('empresa_id', empresa.id)
    .eq('ejercicio', anio);
  const presupuestoMes = new Map<number, number>();
  let presupuesto = 0;
  for (const p of presupuestoFilas ?? []) {
    const mes = Number((p as { mes: number }).mes);
    const importe = Number((p as { importe: number }).importe ?? 0);
    presupuestoMes.set(mes, (presupuestoMes.get(mes) ?? 0) + importe);
    presupuesto += importe;
  }

  const series: SerieMes[] = MESES.map((m) => ({
    mes: m,
    neta: netaMesCur.get(m) ?? 0,
    unidades: unidadesMes.get(m) ?? 0,
    facturas: facturasMesCur.get(m) ?? 0,
    presupuesto: presupuestoMes.get(m) ?? null,
    netaPrevio: netaMesPrev.get(m) ?? null,
  }));

  const topClientesRaw = [...porCliente.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topClientes: ClienteTop[] = [];
  if (topClientesRaw.length) {
    const { data: clis } = await supabase
      .from('clientes')
      .select('id, nombre')
      .in('id', topClientesRaw.map(([id]) => id));
    const nombrePorId = new Map((clis ?? []).map((c) => [c.id, (c as { nombre: string }).nombre]));
    for (const [id, neta] of topClientesRaw) {
      topClientes.push({ id, nombre: nombrePorId.get(id) ?? '—', neta });
    }
  }

  const neta = curs.neta;
  const unidades = curs.unidades;
  const ticketMedio = curs.facturas > 0 ? neta / curs.facturas : 0;
  const precioMedio = unidades > 0 ? neta / unidades : 0;
  const cumplimiento = presupuesto > 0 ? (neta / presupuesto) * 100 : null;

  return {
    empresa,
    anio,
    anioPrevio,
    neta,
    netaPrevioTotal: prev.neta,
    unidades,
    abonosYNotas: curs.abonosYNotas,
    nFacturas: curs.facturas,
    ticketMedio,
    precioMedio,
    presupuesto,
    cumplimiento,
    series,
    topClientes,
  };
}