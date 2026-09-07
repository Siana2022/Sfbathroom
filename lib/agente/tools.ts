import { createClient } from '@/lib/supabase/server';

const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

type FilaFactura = { id: string; fecha: string; tipo_documento: string; total: number; cliente_id: string | null };
type FilaLinea = { factura_id: string; cantidad: number };

export type HerramientaMeta = {
  nombre: string;
  descripcion: string;
  params: Record<string, string>;
};

export const HERRAMIENTAS: HerramientaMeta[] = [
  {
    nombre: 'ventas_por_mes',
    descripcion: 'Neta mensual del ejercicio (facturas + notas de cargo - abonos), unidades y número de documentos. Neta se imputa en la fecha del documento.',
    params: { ejercicio: 'anno (ej. 2026)' },
  },
  {
    nombre: 'evolucion_anual',
    descripcion: 'Neta acumulada a mes dado vs mismo mes del agno anterior del ejercicio actual.',
    params: { mes: 'numero de mes (1-12)', ejercicio: 'anno' },
  },
  {
    nombre: 'top_clientes',
    descripcion: 'Clientes de un ejercicio ordenados por neta descendente, importe y peso %.',
    params: { ejercicio: 'anno' },
  },
  {
    nombre: 'desglose_variacion',
    descripcion: 'Descompone la variacion de neta entre dos ejercicios en efecto precio, volumen, mix y efecto nuevos/perdidos.',
    params: { ejercicio: 'anno actual', previo: 'anno anterior' },
  },
  {
    nombre: 'detalle_clientes',
    descripcion: 'Lista de clientes de la empresa con id, nombre, estado y pais.',
    params: {},
  },
  {
    nombre: 'clientes_impagados',
    descripcion: 'Saldos de cobro por cliente con limite de credito y columnas de vencimiento si existen en la vista.',
    params: {},
  },
];

export type Ejecucion = { ok: boolean; datos: unknown; error?: string };

export class ToolError extends Error {}

async function empresaDe(codigo: string): Promise<string> {
  if (!codigo) throw new ToolError('Debes iniciar sesion.');
  const supabase = createClient();
  const { data } = await supabase.from('empresas').select('id').eq('codigo', codigo).maybeSingle();
  if (!data) throw new ToolError('Empresa no encontrada.');
  return data.id as string;
}

const str = (v?: string) => v?.trim() || undefined;

async function unidadesDeFactuas(supabase: ReturnType<typeof createClient>, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data } = await supabase.from('factura_lineas').select('cantidad').in('factura_id', ids);
  return ((data ?? []) as FilaLinea[]).reduce((acc, l) => acc + Number(l.cantidad ?? 0), 0);
}

export const toolExecutor = {
  async ventas_por_mes(codigoEmpresa: string): Promise<Ejecucion> {
    const supabase = createClient();
    const empresaId = await empresaDe(codigoEmpresa);
    const ejercicio = 2026;
    const { data: filas } = await supabase
      .from('facturas')
      .select('id, fecha, tipo_documento, total')
      .eq('empresa_id', empresaId)
      .gte('fecha', `${ejercicio}-01-01`)
      .lte('fecha', `${ejercicio}-12-31`);
    const docs = (filas ?? []) as FilaFactura[];
    const porMes = new Map<number, { neta: number; documentos: number; abonosYNotas: number }>();
    const idsPorMes = new Map<number, string[]>();
    for (const f of docs) {
      const m = Number(f.fecha.slice(5, 7));
      const cur = porMes.get(m) ?? { neta: 0, documentos: 0, abonosYNotas: 0 };
      cur.neta += Number(f.total ?? 0);
      if (f.tipo_documento === 'factura') {
        cur.documentos += 1;
        const arr = idsPorMes.get(m) ?? [];
        arr.push(f.id);
        idsPorMes.set(m, arr);
      } else cur.abonosYNotas += 1;
      porMes.set(m, cur);
    }
    const unidades = new Map<number, number>();
    for (const [m, ids] of idsPorMes) unidades.set(m, await unidadesDeFactuas(supabase, ids));
    const total = docs.reduce((acc, f) => acc + Number(f.total ?? 0), 0);
    const series = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const c = porMes.get(m) ?? { neta: 0, documentos: 0, abonosYNotas: 0 };
      return { mes: m, etiqueta: MESES[m], neta: c.neta, unidades: unidades.get(m) ?? 0, documentos: c.documentos, abonos_y_notas: c.abonosYNotas };
    });
    return { ok: true, datos: { ejercicio, total_neta: total, por_mes: series } };
  },

  async evolucion_anual(codigoEmpresa: string, args: { mes?: string; ejercicio?: string }): Promise<Ejecucion> {
    const supabase = createClient();
    const empresaId = await empresaDe(codigoEmpresa);
    const mes = Math.min(12, Math.max(1, Number(args.mes ?? 6) || 12));
    const anio = Number(args.ejercicio ?? 2026) || 2026;
    const finMes = `${String(mes).padStart(2, '0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;
    const [{ data: cur }, { data: prev }] = await Promise.all([
      supabase.from('facturas').select('total').eq('empresa_id', empresaId).gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-${finMes}`),
      supabase.from('facturas').select('total').eq('empresa_id', empresaId).gte('fecha', `${anio - 1}-01-01`).lte('fecha', `${anio - 1}-${finMes}`),
    ]);
    const neta = ((cur ?? []) as FilaFactura[]).reduce((a, f) => a + Number(f.total ?? 0), 0);
    const netaPrevio = ((prev ?? []) as FilaFactura[]).reduce((a, f) => a + Number(f.total ?? 0), 0);
    return { ok: true, datos: { ejercicio: anio, previo: anio - 1, hasta_mes: mes, neta, neta_previo: netaPrevio, delta_pct: netaPrevio > 0 ? Math.round(((neta - netaPrevio) / netaPrevio) * 1000) / 10 : null } };
  },

  async top_clientes(codigoEmpresa: string, args: { ejercicio?: string }): Promise<Ejecucion> {
    const supabase = createClient();
    const empresaId = await empresaDe(codigoEmpresa);
    const anio = Number(args.ejercicio ?? 2026) || 2026;
    const { data: filas } = await supabase
      .from('facturas')
      .select('cliente_id, fecha, total')
      .eq('empresa_id', empresaId)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    const porCliente = new Map<string, number>();
    for (const f of (filas ?? []) as FilaFactura[]) {
      if (!f.cliente_id) continue;
      porCliente.set(f.cliente_id, (porCliente.get(f.cliente_id) ?? 0) + Number(f.total ?? 0));
    }
    const total = [...porCliente.values()].reduce((a, b) => a + b, 0);
    const top = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const nombres = new Map<string, string>();
    if (top.length) {
      const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', top.map(([id]) => id));
      for (const c of clis ?? []) nombres.set(c.id as string, c.nombre as string);
    }
    return {
      ok: true,
      datos: {
        ejercicio: anio,
        total_neta: total,
        principales: top.map(([id, importe], i) => ({
          pos: i + 1,
          cliente: nombres.get(id) ?? id,
          importe,
          peso_pct: total > 0 ? Math.round((importe / total) * 1000) / 10 : 0,
        })),
      },
    };
  },

  async desglose_variacion(codigoEmpresa: string, args: { ejercicio?: string; previo?: string }): Promise<Ejecucion> {
    const supabase = createClient();
    const empresaId = await empresaDe(codigoEmpresa);
    const anio = Number(args.ejercicio ?? 2026) || 2026;
    const previo = Number(args.previo ?? anio - 1) || anio - 1;
    const { data: filas } = await supabase
      .from('facturas')
      .select('id, fecha, tipo_documento, total, cliente_id')
      .eq('empresa_id', empresaId)
      .gte('fecha', `${previo}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    const docs = (filas ?? []) as FilaFactura[];
    const info = new Map<string, { anio: number; tipo: string; cliente: string }>();
    for (const f of docs) info.set(f.id, { anio: Number(f.fecha.slice(0, 4)), tipo: f.tipo_documento, cliente: f.cliente_id ?? '' });
    const { data: lineas } = await supabase.from('factura_lineas').select('factura_id, articulo_id, cantidad, importe').in('factura_id', [...info.keys()]);
    const unidades = new Map<string, number[]>();
    const valores = new Map<string, number[]>();
    const porCliente = new Map<string, number[]>();
    for (const l of (lineas ?? []) as { factura_id: string; articulo_id: string; cantidad: number; importe: number }[]) {
      const inf = info.get(l.factura_id)!;
      const cli = inf.cliente;
      const idx = inf.anio === anio ? 1 : 0;
      const signo = inf.tipo === 'abono' ? -1 : 1;
      const importe = Number(l.importe ?? 0) * signo;
      if (importe === 0) continue;
      if (l.articulo_id) {
        const u = (unidades.get(l.articulo_id) ?? [0, 0]) as number[];
        if (inf.tipo === 'factura') u[idx] += Number(l.cantidad ?? 0);
        unidades.set(l.articulo_id, u);
        const v = (valores.get(l.articulo_id) ?? [0, 0]) as number[];
        v[idx] += importe;
        valores.set(l.articulo_id, v);
      }
      if (cli) {
        const c = (porCliente.get(cli) ?? [0, 0]) as number[];
        c[idx] += importe;
        porCliente.set(cli, c);
      }
    }
    let delta = 0, precio = 0, restaVolumenMix = 0, uPrev = 0, uAct = 0, vPrev = 0;
    for (const [art, vals] of valores) {
      const [v0, v1] = vals as number[];
      const [u0, u1] = (unidades.get(art) ?? [0, 0]) as number[];
      const p0 = u0 > 0 ? v0 / u0 : 0;
      const p1 = u1 > 0 ? v1 / u1 : 0;
      delta += v1 - v0;
      precio += (p1 - p0) * u1;
      restaVolumenMix += (u1 - u0) * p0;
      uPrev += u0; uAct += u1; vPrev += v0;
    }
    const pMedioPrev = uPrev > 0 ? vPrev / uPrev : 0;
    const volumen = (uAct - uPrev) * pMedioPrev;
    const mix = restaVolumenMix - volumen;
    const clientes = { nuevos: 0, perdidos: 0, existentes: 0 };
    for (const [prev, act] of porCliente.values()) {
      if (prev === 0 && act !== 0) clientes.nuevos += act;
      else if (act === 0 && prev !== 0) clientes.perdidos -= prev;
      else clientes.existentes += act - prev;
    }
    return { ok: true, datos: { ejercicio: anio, previo, delta, precio, volumen, mix, efecto_clientes: clientes } };
  },

  async detalle_clientes(codigoEmpresa: string): Promise<Ejecucion> {
    const supabase = createClient();
    const empresaId = await empresaDe(codigoEmpresa);
    const { data } = await supabase.from('clientes').select('id, nombre, estado, pais_facturacion').eq('empresa_id', empresaId).order('nombre');
    return { ok: true, datos: (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado, pais: c.pais_facturacion })) };
  },

  async clientes_impagados(codigoEmpresa: string): Promise<Ejecucion> {
    const supabase = createClient();
    const empresaId = await empresaDe(codigoEmpresa);
    const { data } = await supabase.from('clientes').select('id, nombre, limite_credito').eq('empresa_id', empresaId);
    return { ok: true, datos: (data ?? []).map((c) => ({ cliente: c.nombre, limite_credito: c.limite_credito })) };
  },
};

export async function ejecutar(nombreHerramienta: string, args: Record<string, string | undefined>, codigoEmpresa: string, rol?: string): Promise<Ejecucion> {
  const meta = HERRAMIENTAS.find((h) => h.nombre === nombreHerramienta);
    if (!meta) return { ok: false, datos: null, error: `Herramienta desconocida: ${nombreHerramienta}` };

  const e = <T extends string>(k: string, defecto?: T): T | undefined => {
    const v = str(args[k] as string);
    return v ? (v as T) : defecto;
  };

  switch (nombreHerramienta) {
    case 'ventas_por_mes':
      return toolExecutor.ventas_por_mes(codigoEmpresa);
    case 'evolucion_anual':
      return toolExecutor.evolucion_anual(codigoEmpresa, { mes: e('mes'), ejercicio: e('ejercicio') });
    case 'top_clientes':
      return toolExecutor.top_clientes(codigoEmpresa, { ejercicio: e('ejercicio') });
    case 'desglose_variacion':
      return toolExecutor.desglose_variacion(codigoEmpresa, { ejercicio: e('ejercicio'), previo: e('previo') });
    case 'detalle_clientes':
      return toolExecutor.detalle_clientes(codigoEmpresa);
    case 'clientes_impagados':
      return toolExecutor.clientes_impagados(codigoEmpresa);
    default:
      return { ok: false, datos: null, error: `Herramienta sin implementar: ${nombreHerramienta}` };
  }
}