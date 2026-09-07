import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getStock } from '@/lib/datos/stock';
import { getCobros } from '@/lib/datos/cobros';

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

export async function getAlertas(codigoEmpresa: string, anio: number): Promise<AlertasData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const [stock, cobros, configRaw, generadasRaw, facturasRes, clientesRes] = await Promise.all([
    getStock(codigoEmpresa),
    getCobros(codigoEmpresa, anio),
    supabase.from('alertas_config').select('id, modulo, nombre, activo, umbral, unidad').eq('activo', true).order('modulo'),
    supabase.from('alertas_generadas').select('id, referencia, importe, mensaje, leida, fecha').eq('empresa_id', empresa.id).order('fecha', { ascending: false }).limit(15),
    supabase.from('facturas').select('cliente_id').eq('empresa_id', empresa.id).eq('tipo_documento', 'factura').gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`),
    supabase.from('clientes').select('id, estado').eq('empresa_id', empresa.id).eq('estado', 'activo'),
  ]);

  const config = ((configRaw.data ?? []) as Alerta[]);
  const generadas = ((generadasRaw.data ?? []) as AlertaGenerada[]).map((g) => ({
    ...g,
    fecha: (g as { fecha: string }).fecha,
  }));

  const activosAnio = new Set<string>();
  for (const f of facturasRes.data ?? []) {
    const id = (f as { cliente_id: string | null }).cliente_id;
    if (id) activosAnio.add(id);
  }
  const totalActivos = (clientesRes.data ?? []).length;
  const fuga = ((clientesRes.data ?? []) as { id: string }[]).filter((c) => !activosAnio.has(c.id)).length;

  const stockRoturas = stock.roturas;
  const vencido = cobros.vencido;

  let neta = 0;
  let presupuesto = 0;
  {
    const { data: netaRes } = await supabase
      .from('facturas')
      .select('total')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`);
    for (const f of netaRes ?? []) neta += Number((f as { total: number }).total ?? 0);
    const { data: presRes } = await supabase
      .from('presupuesto')
      .select('importe')
      .eq('empresa_id', empresa.id)
      .eq('ejercicio', anio);
    for (const p of presRes ?? []) presupuesto += Number((p as { importe: number }).importe ?? 0);
  }
  const cumplimiento = presupuesto > 0 ? (neta / presupuesto) * 100 : null;

  // desviación de presupuesto (signal) se calcula aparte para no acoplar getFacturacion
  const senales: Senal[] = [
    { etiqueta: 'Roturas de stock', valor: String(stockRoturas), severidad: stockRoturas > 5 ? 'critico' : stockRoturas > 0 ? 'aviso' : 'ok' },
    { etiqueta: 'Referencias bajo punto de pedido', valor: String(stock.bajoPuntoPedido), severidad: stock.bajoPuntoPedido > 8 ? 'critico' : stock.bajoPuntoPedido > 0 ? 'aviso' : 'ok' },
    { etiqueta: 'Vencido total', valor: `${Math.round(vencido)} €`, severidad: vencido > 30000 ? 'critico' : vencido > 5000 ? 'aviso' : 'ok' },
    { etiqueta: 'Clientes activos sin ventas este año (fuga)', valor: String(fuga), severidad: fuga > 3 ? 'critico' : fuga > 0 ? 'aviso' : 'ok' },
    { etiqueta: 'Cumplimiento de presupuesto', valor: cumplimiento === null ? '—' : `${cumplimiento.toFixed(1)} %`, severidad: 'ok' },
  ];

  return { empresa, config, generadas, senales };
}