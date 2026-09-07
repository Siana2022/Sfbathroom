import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type ClientesData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  activos: number;
  activosPrevio: number;
  nuevos: number;
  recuperados: number;
  perdidos: number;
  retencion: number | null;
  tabla: { id: string; nombre: string; neta: number; facturas: number; ticket: number }[];
};

type FilaFactura = { cliente_id: string | null; fecha: string; total: number };
type FilaCliente = { id: string; nombre: string; estado: string; fecha_primer_pedido: string | null };

export async function getClientes(codigoEmpresa: string, anio: number): Promise<ClientesData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;
  const at = String(anio);

  const { data: filas } = await supabase
    .from('facturas')
    .select('cliente_id, fecha, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anioPrevio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const facturas = (filas ?? []) as FilaFactura[];

  const activos = new Set<string>();
  const activosPrevio = new Set<string>();
  const porCliente = new Map<string, { neta: number; facturas: number }>();

  for (const f of facturas) {
    if (!f.cliente_id) continue;
    const esActual = f.fecha.slice(0, 4) === at;
    if (esActual) {
      activos.add(f.cliente_id);
      const c = porCliente.get(f.cliente_id) ?? { neta: 0, facturas: 0 };
      c.neta += Number(f.total ?? 0);
      c.facturas += 1;
      porCliente.set(f.cliente_id, c);
    } else {
      activosPrevio.add(f.cliente_id);
    }
  }

  const { data: clis } = await supabase
    .from('clientes')
    .select('id, nombre, estado, fecha_primer_pedido')
    .eq('empresa_id', empresa.id);
  const clientes = (clis ?? []) as FilaCliente[];

  const perdidos = clientes.filter((c) => c.estado === 'perdido' || c.estado === 'inactivo').length;
  const nuevos = [...activos].filter((id) => !activosPrevio.has(id)).length;
  const recuperados = [...activosPrevio].filter((id) => !activos.has(id)).length;
  const retencion = activosPrevio.size > 0 ? ([...activos].filter((id) => activosPrevio.has(id)).length / activosPrevio.size) * 100 : null;

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  const tabla = [...porCliente.entries()]
    .map(([id, v]) => ({
      id,
      nombre: nombreCliente.get(id) ?? '—',
      neta: v.neta,
      facturas: v.facturas,
      ticket: v.facturas > 0 ? v.neta / v.facturas : 0,
    }))
    .sort((a, b) => b.neta - a.neta)
    .slice(0, 15);

  return {
    empresa,
    anio,
    activos: activos.size,
    activosPrevio: activosPrevio.size,
    nuevos,
    recuperados,
    perdidos,
    retencion,
    tabla,
  };
}