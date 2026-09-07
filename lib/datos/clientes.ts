import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type ClientesData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  activos: number;
  activosPrevio: number;
  activos12m: number;
  nuevos: number;
  recuperados: number;
  perdidos: number;
  retencion: number | null;
  tabla: { id: string; nombre: string; neta: number; facturas: number; ticket: number }[];
  familias: string[];
  matriz: { id: string; nombre: string; neta: number; compradas: boolean[] }[];
  semaforo: { id: string; nombre: string; estado: string; diasSin: number; frecuencia: number | null; nivel: 'ok' | 'aviso' | 'critico' }[];
  noActivos: { nombre: string; diasSin: number; ultimaFactura: string }[];
  movimiento: { nombre: string; netaActual: number; netaPrevia: number; delta: number; deltaPct: number | null }[];
  cohortes: { mes: string; nuevos: number; activos12m: number; retencion: number | null }[];
};

type FilaFactura = { id: string; cliente_id: string | null; fecha: string; total: number };
type FilaCliente = { id: string; nombre: string; estado: string; fecha_primer_pedido: string | null };
type FilaFamilia = { id: string; nombre: string };
type FilaArticulo = { id: string; familia_id: string | null };
type FilaLinea = { factura_id: string; articulo_id: string | null };
type FilaPedido = { cliente_id: string | null; fecha_entrada: string };

const DIA = 86400000;

export async function getClientes(codigoEmpresa: string, anio: number): Promise<ClientesData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;
  const at = String(anio);

  const hoy = Math.floor(Date.now() / DIA);
  const iso = (dias: number) => new Date((hoy - dias) * DIA).toISOString().slice(0, 10);

  const { data: filas } = await supabase
    .from('facturas')
    .select('id, cliente_id, fecha, total')
    .eq('empresa_id', empresa.id)
    .gte('fecha', iso(730))
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
    const s = fechasCliente.get(f.cliente_id) ?? new Set<string>();
    s.add(f.fecha);
    fechasCliente.set(f.cliente_id, s);
  }

  const { data: pedidosRaw } = await supabase
    .from('pedidos')
    .select('cliente_id, fecha_entrada')
    .eq('empresa_id', empresa.id)
    .gte('fecha_entrada', iso(365));
  const pedidos = (pedidosRaw ?? []) as FilaPedido[];
  const activos12m = new Set(pedidos.map((p) => p.cliente_id).filter(Boolean));
  const ultimoPedido = new Map<string, string>();
  for (const p of pedidos) {
    if (!p.cliente_id) continue;
    const prev = ultimoPedido.get(p.cliente_id);
    if (!prev || p.fecha_entrada > prev) ultimoPedido.set(p.cliente_id, p.fecha_entrada);
  }

  const { data: clis } = await supabase
    .from('clientes')
    .select('id, nombre, estado, fecha_primer_pedido')
    .eq('empresa_id', empresa.id);
  const clientes = (clis ?? []) as FilaCliente[];

  const perdidos = clientes.filter((c) => c.estado === 'perdido' || c.estado === 'inactivo').length;
  const nuevos = [...activos].filter((id) => !activosPrevio.has(id)).length;
  const recuperados = [...activosPrevio].filter((id) => !activos.has(id)).length;
  const retencion = activosPrevio.size > 0 ? [...activos].filter((id) => activosPrevio.has(id)).length / activosPrevio.size * 100 : null;

  const noActivos: ClientesData['noActivos'] = [];
  for (const c of clientes) {
    if (c.estado !== 'activo') continue;
    const fechas = fechasCliente.get(c.id);
    if (!fechas || fechas.size === 0) continue;
    const ultima = [...fechas].sort().reverse()[0];
    const diasSin = Math.round((hoy * DIA - Date.parse(ultima)) / DIA);
    if (diasSin > 365) {
      noActivos.push({ nombre: c.nombre, diasSin, ultimaFactura: ultima });
    }
  }
  noActivos.sort((a, b) => b.diasSin - a.diasSin).slice(0, 10);

  const netaW1 = new Map<string, number>();
  const netaW2 = new Map<string, number>();
  for (const f of facturas) {
    if (!f.cliente_id) continue;
    const dia = Math.floor(Date.parse(f.fecha) / DIA);
    if (dia > hoy) continue;
    const total = Number(f.total ?? 0);
    if (dia > hoy - 365) netaW1.set(f.cliente_id, (netaW1.get(f.cliente_id) ?? 0) + total);
    else if (dia > hoy - 730) netaW2.set(f.cliente_id, (netaW2.get(f.cliente_id) ?? 0) + total);
  }
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  const movimiento = [...new Set([...netaW1.keys(), ...netaW2.keys()])]
    .map((id) => {
      const actual = netaW1.get(id) ?? 0;
      const previa = netaW2.get(id) ?? 0;
      return { nombre: nombreCliente.get(id) ?? '—', netaActual: actual, netaPrevia: previa, delta: actual - previa, deltaPct: previa > 0 ? ((actual - previa) / previa) * 100 : null };
    })
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 12);

  const primeraFecha = new Map<string, string>();
  for (const [id, fechas] of fechasCliente.entries()) {
    primeraFecha.set(id, [...fechas].sort()[0]);
  }
  const cohortes: ClientesData['cohortes'] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mesS = String(mes).padStart(2, '0');
    const clavePrevio = `${anioPrevio}-${mesS}`;
    const miembros = [...primeraFecha.entries()].filter(([, fecha]) => fecha.slice(0, 7) === clavePrevio).map(([id]) => id);
    if (miembros.length === 0) continue;
    const activosRet = miembros.filter((id) => activos12m.has(id)).length;
    cohortes.push({
      mes: clavePrevio,
      nuevos: miembros.length,
      activos12m: activosRet,
      retencion: miembros.length > 0 ? (activosRet / miembros.length) * 100 : null,
    });
  }
  cohortes.sort((a, b) => (a.mes < b.mes ? -1 : 1));

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

  const semaforo = clientes
    .map((c) => {
      const fechas = fechasCliente.get(c.id);
      if (!fechas || fechas.size === 0) return null;
      const ordenadas = [...fechas].sort().reverse();
      const diasSin = Math.round((hoy * DIA - Date.parse(ordenadas[0])) / DIA);
      let frecuencia: number | null = null;
      if (ordenadas.length > 1) {
        const primera = Date.parse(ordenadas[ordenadas.length - 1]);
        const ultima = Date.parse(ordenadas[0]);
        frecuencia = (ultima - primera) / ((ordenadas.length - 1) * DIA);
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
    activos12m: activos12m.size,
    nuevos,
    recuperados,
    perdidos,
    retencion,
    tabla,
    familias: familias.map((f) => f.nombre),
    matriz,
    semaforo,
    noActivos,
    movimiento,
    cohortes,
  };
}