import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getStock } from '@/lib/datos/stock';
import { getCobros } from '@/lib/datos/cobros';
import { getConcentracion } from '@/lib/datos/concentracion';
import { getMargen } from '@/lib/datos/margen';

export type Alerta = {
  id: string;
  modulo: string;
  nombre: string;
  activo: boolean;
  umbral: number | null;
  unidad: string | null;
};

export type AlertaGenerada = {
  id: string;
  referencia: string | null;
  importe: number | null;
  mensaje: string | null;
  leida: boolean;
  fecha: string;
};

export type Senal = {
  etiqueta: string;
  valor: string;
  severidad: 'ok' | 'aviso' | 'critico';
};

export type AlertasData = {
  empresa: { id: string; codigo: string; nombre: string };
  config: Alerta[];
  generadas: AlertaGenerada[];
  senales: Senal[];
};

type ConfigRow = Alerta & { config: Record<string, number | string> };

const DEFAULT_UMBRALES: Record<string, number> = {
  'stock.rotura': 5,
  'stock.bajo_punto_pedido': 8,
  'cobros.vencido_total': 30000,
  'clientes.fuga': 3,
  'clientes.no_activos': 3,
  'presupuesto.desviacion_mes': -15,
};

function umbralDe(map: Map<string, ConfigRow>, clave: string): number {
  const row = map.get(clave);
  return row?.umbral ?? DEFAULT_UMBRALES[clave] ?? 0;
}

function avisoDe(map: Map<string, ConfigRow>, clave: string): number | null {
  const v = map.get(clave)?.config?.aviso;
  return typeof v === 'number' ? v : null;
}

function severidad(valor: number, critico: number, aviso: number | null): Senal['severidad'] {
  if (valor <= critico) return 'ok';
  if (aviso === null || valor <= aviso) return 'aviso';
  return 'critico';
}

export async function getAlertas(codigoEmpresa: string, anio: number): Promise<AlertasData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const hoy = new Date();
  const iso = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

  const [stock, cobros, configRaw, generadasRaw, facturasRes, clientesRes, pedidosRes] = await Promise.all([
    getStock(codigoEmpresa),
    getCobros(codigoEmpresa, anio),
    supabase.from('alertas_config').select('id, modulo, nombre, activo, umbral, unidad, config').order('modulo'),
    supabase.from('alertas_generadas').select('id, referencia, importe, mensaje, leida, fecha').eq('empresa_id', empresa.id).order('fecha', { ascending: false }).limit(15),
    supabase
      .from('facturas')
      .select('cliente_id')
      .eq('empresa_id', empresa.id)
      .eq('tipo_documento', 'factura')
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`),
    supabase.from('clientes').select('id, estado').eq('empresa_id', empresa.id).eq('estado', 'activo'),
    supabase.from('pedidos').select('cliente_id').eq('empresa_id', empresa.id).gte('fecha_entrada', iso(365)),
  ]);

  const config = (configRaw.data ?? []) as ConfigRow[];
  const configMap = new Map(config.map((c) => [`${c.modulo}.${c.nombre}`, c]));
  const generadas = (generadasRaw.data ?? []) as AlertaGenerada[];

  const activosAnio = new Set<string>();
  for (const f of facturasRes.data ?? []) {
    const id = (f as { cliente_id: string | null }).cliente_id;
    if (id) activosAnio.add(id);
  }
  const fuga = ((clientesRes.data ?? []) as { id: string }[]).filter((c) => !activosAnio.has(c.id)).length;

  const activos12m = new Set<string>();
  for (const p of pedidosRes.data ?? []) {
    const id = (p as { cliente_id: string | null }).cliente_id;
    if (id) activos12m.add(id);
  }
  const noActivos = ((clientesRes.data ?? []) as { id: string }[]).filter((c) => !activos12m.has(c.id)).length;

  const concentracion = await getConcentracion(codigoEmpresa, anio);
  const margen = await getMargen(codigoEmpresa, anio);

  const stockRoturas = stock.roturas;
  const vencido = cobros.vencido;
  const umbralRetraso = umbralDe(configMap, 'proveedores.retraso');
  const proveedoresConRetraso = concentracion.riesgoProveedor.filter((p) => p.plazoReal !== null && p.plazoReal > umbralRetraso).length;
  const familiasDependientes = concentracion.riesgo.length;
  const umbralDso = umbralDe(configMap, 'cobros.dso');
  const clientesDsoAlAlza = cobros.porCliente.filter((c) => {
    if (c.dso === null || c.dsoDelta === null) return false;
    const mediaHistorica = c.dso - c.dsoDelta;
    return mediaHistorica > 0 && c.dso > mediaHistorica * umbralDso;
  }).length;
  const umbralErosion = umbralDe(configMap, 'ventas.erosion_precio');
  const erosionPrecio = margen.sinAcceso ? null : margen.erosionTarifa.filter((e) => e.erosionPct > umbralErosion).length;
  const conAlerta = (n: number) => (n > 0 ? ('critico' as const) : ('ok' as const));

  const satImporte = umbralDe(configMap, 'comerciales.saturacion_importe');
  const satClientes = umbralDe(configMap, 'comerciales.saturacion_clientes');

  let neta = 0;
  let presupuesto = 0;
  let trimNeta = 0;
  const mesActual = Number(new Date().toISOString().slice(5, 7));
  const trimActual = Math.floor((mesActual - 1) / 3) + 1;
  {
    const { data: netaRes } = await supabase
      .from('facturas')
      .select('total, fecha')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    for (const f of netaRes ?? []) {
      const total = Number((f as { total: number }).total ?? 0);
      neta += total;
      const fecha = (f as { fecha: string }).fecha;
      const trim = Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1;
      if (trim === trimActual) trimNeta += total;
    }
    const { data: presRes } = await supabase
      .from('presupuesto')
      .select('importe')
      .eq('empresa_id', empresa.id)
      .eq('ejercicio', anio);
    for (const p of presRes ?? []) presupuesto += Number((p as { importe: number }).importe ?? 0);
  }
  const cumplimiento = presupuesto > 0 ? (neta / presupuesto) * 100 : null;
  const saturadoImporte = trimNeta > satImporte;
  const saturadoClientes = activos12m.size > satClientes;
  const saturacion = saturadoImporte || saturadoClientes;

  const senales: Senal[] = [
    {
      etiqueta: 'Roturas de stock',
      valor: String(stockRoturas),
      severidad: severidad(stockRoturas, umbralDe(configMap, 'stock.rotura'), avisoDe(configMap, 'stock.rotura')),
    },
    {
      etiqueta: 'Referencias bajo punto de pedido',
      valor: String(stock.bajoPuntoPedido),
      severidad: severidad(stock.bajoPuntoPedido, umbralDe(configMap, 'stock.bajo_punto_pedido'), avisoDe(configMap, 'stock.bajo_punto_pedido')),
    },
    {
      etiqueta: 'Vencido total',
      valor: `${Math.round(vencido)} €`,
      severidad: severidad(vencido, umbralDe(configMap, 'cobros.vencido_total'), avisoDe(configMap, 'cobros.vencido_total')),
    },
    {
      etiqueta: 'Clientes activos sin ventas este año (fuga)',
      valor: String(fuga),
      severidad: severidad(fuga, umbralDe(configMap, 'clientes.fuga'), avisoDe(configMap, 'clientes.fuga')),
    },
    {
      etiqueta: 'Clientes activos sin pedidos en 12 meses (Q2)',
      valor: String(noActivos),
      severidad: severidad(noActivos, umbralDe(configMap, 'clientes.no_activos'), avisoDe(configMap, 'clientes.no_activos')),
    },
    {
      etiqueta: 'Saturación comercial (Q6)',
      valor: `${Math.round(trimNeta / 1000)} k€ trim. · ${activos12m.size} clientes activos`,
      severidad: saturacion ? 'critico' : 'ok',
    },
    {
      etiqueta: 'Proveedores con retraso real',
      valor: String(proveedoresConRetraso),
      severidad: conAlerta(proveedoresConRetraso),
    },
    {
      etiqueta: 'Familias dependientes de un cliente',
      valor: String(familiasDependientes),
      severidad: conAlerta(familiasDependientes),
    },
    {
      etiqueta: 'Clientes alargando pagos (DSO al alza)',
      valor: String(clientesDsoAlAlza),
      severidad: conAlerta(clientesDsoAlAlza),
    },
    {
      etiqueta: 'Erosión de precio sobre tarifa',
      valor: erosionPrecio === null ? '—' : String(erosionPrecio),
      severidad: erosionPrecio === null ? 'ok' : conAlerta(erosionPrecio),
    },
    { etiqueta: 'Cumplimiento de presupuesto', valor: cumplimiento === null ? '—' : `${cumplimiento.toFixed(1)} %`, severidad: 'ok' },
  ];

  return { empresa, config: config.filter((c) => c.activo), generadas, senales };
}