import { createClient } from '@/lib/supabase/server';
import { filtrarPorIds, getFacturaIdsFiltradas, type Filtros } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';

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

export type Variacion = {
  delta: number;
  precio: number;
  volumen: number;
  mix: number;
  efectoClientes: { nuevos: number; perdidos: number; existentes: number };
};

type FilaFacturaVariacion = {
  id: string;
  cliente_id: string | null;
  fecha: string;
  tipo_documento: string;
};
type FilaLineaVariacion = { factura_id: string; articulo_id: string; cantidad: number; importe: number };

export async function getVariacion(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<Variacion> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;

  const [idsFiltrados, filasRes] = await Promise.all([
    getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anioPrevio}-01-01`, `${anio}-12-31`),
    supabase
      .from('facturas')
      .select('id, cliente_id, fecha, tipo_documento')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anioPrevio}-01-01`)
      .lte('fecha', `${anio}-12-31`),
  ]);
  const facturas = filtrarPorIds((filasRes.data ?? []) as FilaFacturaVariacion[], idsFiltrados);

  const infoPorId = new Map<string, { anio: number; tipo: string }>();
  const clientePorId = new Map<string, string | null>();
  for (const f of facturas) {
    infoPorId.set(f.id, { anio: Number(f.fecha.slice(0, 4)), tipo: f.tipo_documento });
    clientePorId.set(f.id, f.cliente_id);
  }

  const lineasArr = await lineasPorFacturas<FilaLineaVariacion>(
    supabase,
    'factura_id, articulo_id, cantidad, importe',
    [...infoPorId.keys()],
  );

  const unidades = new Map<string, number[]>(); // articulo -> [P0 unidades, P1 unidades]
  const valores = new Map<string, number[]>(); // articulo -> [P0 importe, P1 importe]
  const porCliente = new Map<string, [number, number]>(); // cliente -> [previo, actual]

  for (const l of lineasArr) {
    const info = infoPorId.get(l.factura_id);
    const cliente = clientePorId.get(l.factura_id);
    if (!info) continue;
    const idx = info.anio === anio ? 1 : 0;
    const signo = info.tipo === 'abono' ? -1 : 1;
    const importe = Number(l.importe ?? 0) * signo;
    if (importe === 0) continue;

    if (l.articulo_id) {
      const u = (unidades.get(l.articulo_id) ?? [0, 0]) as [number, number];
      if (info.tipo === 'factura') u[idx] += Number(l.cantidad ?? 0);
      unidades.set(l.articulo_id, u);
      const v = (valores.get(l.articulo_id) ?? [0, 0]) as [number, number];
      v[idx] += importe;
      valores.set(l.articulo_id, v);
    }
    if (cliente) {
      const c = porCliente.get(cliente) ?? [0, 0];
      c[idx] += importe;
      porCliente.set(cliente, c);
    }
  }

  let delta = 0;
  let efectoPrecio = 0;
  let restaVolumenMix = 0;
  let uPrev = 0;
  let uAct = 0;
  let vPrev = 0;
  for (const [articulo, vals] of valores) {
    const [v0, v1] = vals as [number, number];
    const [u0, u1] = (unidades.get(articulo) ?? [0, 0]) as [number, number];
    const p0 = u0 > 0 ? v0 / u0 : 0;
    const p1 = u1 > 0 ? v1 / u1 : 0;
    delta += v1 - v0;
    efectoPrecio += (p1 - p0) * u1;
    restaVolumenMix += (u1 - u0) * p0;
    uPrev += u0;
    uAct += u1;
    vPrev += v0;
  }
  const precioMedioPrev = uPrev > 0 ? vPrev / uPrev : 0;
  const efectoVolumen = (uAct - uPrev) * precioMedioPrev;
  const efectoMix = restaVolumenMix - efectoVolumen;

  const clientes = { nuevos: 0, perdidos: 0, existentes: 0 };
  for (const [previo, actual] of porCliente.values()) {
    if (previo === 0 && actual !== 0) clientes.nuevos += actual;
    else if (actual === 0 && previo !== 0) clientes.perdidos -= previo;
    else clientes.existentes += actual - previo;
  }

  return { delta, precio: efectoPrecio, volumen: efectoVolumen, mix: efectoMix, efectoClientes: clientes };
}

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

export async function getFacturacion(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<FacturacionData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;
  const at = String(anio);
  const conFiltros = Boolean(filtros && (filtros.cliente || filtros.comercial || filtros.familia || filtros.marca));

  const idsFiltrados = getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, `${anioPrevio}-01-01`, `${anio}-12-31`);
  const facturasP = supabase
    .from('facturas')
    .select('id, cliente_id, fecha, tipo_documento, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anioPrevio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const presupuestoP = filtros?.marca
    ? Promise.resolve({ data: [] as unknown[] })
    : (() => {
        let pq = supabase
          .from('presupuesto')
          .select('mes, importe')
          .eq('empresa_id', empresa.id)
          .eq('ejercicio', anio);
        if (filtros?.cliente) pq = pq.eq('cliente_id', filtros.cliente);
        if (filtros?.comercial) pq = pq.eq('comercial_id', filtros.comercial);
        if (filtros?.familia) pq = pq.eq('familia_id', filtros.familia);
        return pq;
      })();
  const vistaP = conFiltros
    ? Promise.resolve({ data: null as unknown, error: null })
    : supabase
        .from('v_perf_facturacion_mensual')
        .select('mes, ejercicio, neta_total, n_facturas, unidades')
        .eq('empresa_id', empresa.id)
        .in('ejercicio', [anio, anioPrevio]);

  const [idsFiltradosRes, filasRes, presupuestoRes, vistaRes] = await Promise.all([idsFiltrados, facturasP, presupuestoP, vistaP]);
  const facturas = filtrarPorIds((filasRes.data ?? []) as FilaFactura[], idsFiltradosRes);

  const curs = { neta: 0, unidades: 0, facturas: 0, abonosYNotas: 0 };
  const prev = { neta: 0, unidades: 0, facturas: 0 };

  const mesDeLaFactura = new Map<string, number>();
  const idsActivo: string[] = [];
  const idsPrevio: string[] = [];

  const netaMesCur = new Map<number, number>();
  const netaMesPrev = new Map<number, number>();
  const facturasMesCur = new Map<number, number>();
  const porCliente = new Map<string, number>();

  const vistaDisp = !conFiltros && !vistaRes.error && Array.isArray(vistaRes.data);

  if (vistaDisp) {
    for (const v of vistaRes.data as { mes: number; ejercicio: number; neta_total: number; n_facturas: number; unidades: number }[]) {
      const mes = Number(v.mes);
      if (Number(v.ejercicio) === anio) {
        curs.neta += Number(v.neta_total ?? 0);
        curs.unidades += Number(v.unidades ?? 0);
        curs.facturas += Number(v.n_facturas ?? 0);
        netaMesCur.set(mes, (netaMesCur.get(mes) ?? 0) + Number(v.neta_total ?? 0));
        facturasMesCur.set(mes, (facturasMesCur.get(mes) ?? 0) + Number(v.n_facturas ?? 0));
      } else {
        prev.neta += Number(v.neta_total ?? 0);
        prev.unidades += Number(v.unidades ?? 0);
        prev.facturas += Number(v.n_facturas ?? 0);
        netaMesPrev.set(mes, (netaMesPrev.get(mes) ?? 0) + Number(v.neta_total ?? 0));
      }
    }
  }

  for (const f of facturas) {
    const esActual = f.fecha.slice(0, 4) === at;
    const total = Number(f.total ?? 0);
    if (esActual) {
      if (TIPOS_UNIDADES.has(f.tipo_documento)) {
        if (f.cliente_id) porCliente.set(f.cliente_id, (porCliente.get(f.cliente_id) ?? 0) + total);
      } else {
        curs.abonosYNotas += 1;
      }
    }
    if (vistaDisp) continue;
    const mes = Number(f.fecha.slice(5, 7));
    if (esActual) {
      curs.neta += total;
      netaMesCur.set(mes, (netaMesCur.get(mes) ?? 0) + total);
      if (TIPOS_UNIDADES.has(f.tipo_documento)) {
        curs.facturas += 1;
        facturasMesCur.set(mes, (facturasMesCur.get(mes) ?? 0) + 1);
        idsActivo.push(f.id);
        mesDeLaFactura.set(f.id, mes);
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
  if (!vistaDisp && (idsActivo.length || idsPrevio.length)) {
    const lineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, cantidad', [...idsActivo, ...idsPrevio]);
    const setActivo = new Set(idsActivo);
    for (const l of lineas) {
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
  } else if (vistaDisp) {
    for (const v of vistaRes.data as { mes: number; ejercicio: number; unidades: number }[]) {
      const mes = Number(v.mes);
      const u = Number(v.unidades ?? 0);
      if (Number(v.ejercicio) === anio) unidadesMes.set(mes, (unidadesMes.get(mes) ?? 0) + u);
      else unidadesMesPrev.set(mes, (unidadesMesPrev.get(mes) ?? 0) + u);
    }
  }

  const presupuestoFilas = (presupuestoRes.data ?? []) as { mes: number; importe: number }[];
  const presupuestoMes = new Map<number, number>();
  let presupuesto = 0;
  for (const p of presupuestoFilas) {
    const mes = Number(p.mes);
    const importe = Number(p.importe ?? 0);
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