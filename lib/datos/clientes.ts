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
  familias: string[];
  matriz: { id: string; nombre: string; neta: number; compradas: boolean[] }[];
  semaforo: { id: string; nombre: string; estado: string; diasSin: number; frecuencia: number | null; nivel: 'ok' | 'aviso' | 'critico' }[];
};

type FilaFactura = { id: string; cliente_id: string | null; fecha: string; total: number };
type FilaCliente = { id: string; nombre: string; estado: string; fecha_primer_pedido: string | null };
type FilaFamilia = { id: string; nombre: string };
type FilaArticulo = { id: string; familia_id: string | null };
type FilaLinea = { factura_id: string; articulo_id: string | null };

export async function getClientes(codigoEmpresa: string, anio: number): Promise<ClientesData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;
  const at = String(anio);

  const { data: filas } = await supabase
    .from('facturas')
    .select('id, cliente_id, fecha, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anioPrevio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const facturas = (filas ?? []) as FilaFactura[];

  const activos = new Set<string>();
  const activosPrevio = new Set<string>();
  const porCliente = new Map<string, { neta: number; facturas: number }>();
  const fechasCliente = new Map<string, Set<string>>();
  const idsFacturasAnio: string[] = [];
  const clienteDeFactura = new Map<string, string | null>();

  for (const f of facturas) {
    if (!f.cliente_id) continue;
    const esActual = f.fecha.slice(0, 4) === at;
    if (esActual) {
      activos.add(f.cliente_id);
      const c = porCliente.get(f.cliente_id) ?? { neta: 0, facturas: 0 };
      c.neta += Number(f.total ?? 0);
      c.facturas += 1;
      porCliente.set(f.cliente_id, c);
      idsFacturasAnio.push(f.id);
      clienteDeFactura.set(f.id, f.cliente_id);
    } else {
      activosPrevio.add(f.cliente_id);
    }
    if (f.id) {
      const s = fechasCliente.get(f.cliente_id) ?? new Set<string>();
      s.add(f.fecha);
      fechasCliente.set(f.cliente_id, s);
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

  const { data: familiasFilas } = await supabase.from('familias_articulo').select('id, nombre').eq('empresa_id', empresa.id).order('nombre');
  const familias = (familiasFilas ?? []) as FilaFamilia[];
  const familiasOrden = familias.map((f) => f.id);

  const { data: articulosFilas } = await supabase.from('articulos').select('id, familia_id').eq('empresa_id', empresa.id);
  const familiaDeArticulo = new Map<string, string | null>((articulosFilas ?? [] as FilaArticulo[]).map((a) => [a.id, a.familia_id]));

  const familiasCliente = new Map<string, Set<string>>();
  if (idsFacturasAnio.length) {
    const { data: lineas } = await supabase
      .from('factura_lineas')
      .select('factura_id, articulo_id')
      .in('factura_id', idsFacturasAnio);
    for (const l of (lineas ?? []) as FilaLinea[]) {
      const cli = clienteDeFactura.get(l.factura_id);
      const fam = l.articulo_id ? familiaDeArticulo.get(l.articulo_id) : null;
      if (!cli || !fam) continue;
      const s = familiasCliente.get(cli) ?? new Set<string>();
      s.add(fam);
      familiasCliente.set(cli, s);
    }
  }

  const matriz = [...porCliente.entries()]
    .map(([id, v]) => ({
      id,
      nombre: nombreCliente.get(id) ?? '—',
      neta: v.neta,
      compradas: familiasOrden.map((fid) => familiasCliente.get(id)?.has(fid) ?? false),
    }))
    .sort((a, b) => b.neta - a.neta)
    .slice(0, 12);

  const hoy = Date.now();
  const semaforo = clientes
    .map((c) => {
      const fechas = fechasCliente.get(c.id);
      if (!fechas || fechas.size === 0) return null;
      const ordenadas = [...fechas].sort().reverse();
      const diasSin = Math.round((hoy - Date.parse(ordenadas[0])) / 86400000);
      let frecuencia: number | null = null;
      if (ordenadas.length > 1) {
        const primera = Date.parse(ordenadas[ordenadas.length - 1]);
        const ultima = Date.parse(ordenadas[0]);
        frecuencia = (ultima - primera) / ((ordenadas.length - 1) * 86400000);
      }
      let nivel: 'ok' | 'aviso' | 'critico';
      if (frecuencia === null) nivel = diasSin > 90 ? 'aviso' : 'ok';
      else if (diasSin <= frecuencia) nivel = 'ok';
      else if (diasSin <= frecuencia * 2.5) nivel = 'aviso';
      else nivel = 'critico';
      return { id: c.id, nombre: c.nombre, estado: c.estado, diasSin, frecuencia, nivel };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x) => x.estado === 'activo' && x.nivel !== 'ok')
    .sort((a, b) => b.diasSin - a.diasSin)
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
    familias: familias.map((f) => f.nombre),
    matriz,
    semaforo,
  };
}