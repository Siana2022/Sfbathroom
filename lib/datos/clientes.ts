import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { filtrarPorIds, getFacturaIdsFiltradas, hayFiltros, type Filtros } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { ventasFacturasRangoRpc } from '@/lib/datos/ventas';

export type ClienteActividad = {
  id: string;
  nombre: string;
  netaAnio: number;
  netaPrev: number;
  neta12m: number;
  facturasAnio: number;
  primera: string | null;
  ultima: string | null;
  diasSin: number | null;
  comercial: string | null;
  margen: number;
  margenPct: number | null;
};

export type ListasClientes = {
  activos12m: ClienteActividad[];
  nuevos: ClienteActividad[];
  recuperados: ClienteActividad[];
  inactivos: ClienteActividad[];
  perdidos: ClienteActividad[];
};

export type ClientesData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  activos: number;
  activosPrevio: number;
  activos12m: number;
  nuevos: number;
  recuperados: number;
  perdidos: number;
  inactivos: number;
  retencion: number | null;
  tabla: { id: string; nombre: string; neta: number; coste: number; margen: number; margenPct: number | null; facturas: number; ticket: number; comercial: string | null }[];
  familias: string[];
  matriz: { id: string; nombre: string; neta: number; compradas: boolean[] }[];
  semaforo: { id: string; nombre: string; estado: string; diasSin: number; frecuencia: number | null; nivel: 'ok' | 'aviso' | 'critico' }[];
  noActivos: { id: string; nombre: string; diasSin: number; ultimaFactura: string; comercial: string | null }[];
  movimiento: { id: string; nombre: string; netaActual: number; netaPrevia: number; delta: number; deltaPct: number | null }[];
  listas: ListasClientes;
};

type FilaFactura = { id: string; cliente_id: string | null; fecha: string; base_imponible: number };
type FilaCliente = { id: string; nombre: string; estado: string; fecha_primer_pedido: string | null; comercial_id: string | null };
type FilaArticulo = { id: string; familia: string | null };
type FilaLinea = { factura_id: string; articulo_id: string | null };
type FilaPedido = { cliente_id: string | null; fecha_entrada: string };

type FilaActividad = {
  cliente_id: string;
  primera: string | null;
  ultima: string | null;
  facturasAnio: number;
  netaAnio: number;
  netaPrev: number;
  neta12m: number;
};

const DIA = 86400000;

export async function getClientes(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<ClientesData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;
  const at = String(anio);

  const hoy = Math.floor(Date.now() / DIA);
  const iso = (dias: number) => new Date((hoy - dias) * DIA).toISOString().slice(0, 10);

  const sinFiltros = !filtros || !hayFiltros(filtros);

  // Todo lo independiente sale en paralelo: cada ida y vuelta cuesta 150-300 ms.
  const [facturasRpc, pedidos, clientes, comercialesRes, actividadRes, margenRes, familiasRaw] = await Promise.all([
    sinFiltros ? ventasFacturasRangoRpc(supabase, codigoEmpresa, iso(730), `${anio}-12-31`) : Promise.resolve(null),
    todasLasFilas<FilaPedido>((desde) => {
      let q = supabase
        .from('pedidos')
        .select('cliente_id, fecha_entrada')
        .eq('empresa_id', empresa.id)
        .gte('fecha_entrada', iso(365));
      if (filtros?.cliente) q = q.eq('cliente_id', filtros.cliente);
      if (filtros?.comercial) q = q.eq('comercial_id', filtros.comercial);
      return q.range(desde, desde + TAMANO_PAGINA - 1);
    }),
    todasLasFilas<FilaCliente>((desde) =>
      supabase
        .from('clientes')
        .select('id, nombre, estado, fecha_primer_pedido, comercial_id')
        .eq('empresa_id', empresa.id)
        .range(desde, desde + TAMANO_PAGINA - 1),
    ),
    supabase.from('comerciales').select('id, nombre'),
    supabase.rpc('clientes_actividad', {
      p_codigo_empresa: codigoEmpresa,
      p_anio: anio,
      p_cliente: filtros?.cliente ?? null,
      p_comercial: filtros?.comercial ?? null,
      p_familia: filtros?.familia ?? null,
      p_marca: filtros?.marca ?? null,
    }),
    supabase.rpc('clientes_margen', {
      p_codigo_empresa: codigoEmpresa,
      p_anio: anio,
      p_cliente: filtros?.cliente ?? null,
      p_comercial: filtros?.comercial ?? null,
      p_familia: filtros?.familia ?? null,
      p_marca: filtros?.marca ?? null,
    }),
    supabase.rpc('familias_articulos', { p_codigo_empresa: codigoEmpresa }),
  ]);

  let facturas: FilaFactura[];
  if (facturasRpc) {
    facturas = facturasRpc as unknown as FilaFactura[];
  } else {
    const idsFiltrados = await getFacturaIdsFiltradas(supabase, empresa.id, filtros ?? {}, iso(730), `${anio}-12-31`);
    const filas = await todasLasFilas<FilaFactura>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, fecha, base_imponible')
        .eq('empresa_id', empresa.id)
        .gte('fecha', iso(730))
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1)
    );
    facturas = filtrarPorIds(filas, idsFiltrados);
  }

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
      c.neta += Number(f.base_imponible ?? 0);
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

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  const comercialDeCliente = new Map(clientes.map((c) => [c.id, c.comercial_id]));

  const activos12m = new Set(pedidos.map((p) => p.cliente_id).filter((x): x is string => Boolean(x)));
  const ultimoPedido = new Map<string, string>();
  for (const p of pedidos) {
    if (!p.cliente_id) continue;
    const prev = ultimoPedido.get(p.cliente_id);
    if (!prev || p.fecha_entrada > prev) ultimoPedido.set(p.cliente_id, p.fecha_entrada);
  }

  const comercialesRaw = comercialesRes.data;
  const nombreComercial = new Map(
    ((comercialesRaw ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]),
  );

  // Actividad agregada en SQL: primera/última factura y facturación por ejercicio.
  const actividadRaw = actividadRes.data;
  const actividad = Array.isArray(actividadRaw) ? (actividadRaw as FilaActividad[]) : null;

  const margenRaw = margenRes.data;
  const costePorCliente = new Map<string, number>();
  if (Array.isArray(margenRaw)) {
    for (const m of margenRaw as { cliente_id: string; coste: number }[]) {
      costePorCliente.set(m.cliente_id, Number(m.coste ?? 0));
    }
  }

  let perdidos = 0;
  let inactivos = 0;
  let nuevos = 0;
  let recuperados = 0;
  let retencion: number | null = null;
  let noActivos: ClientesData['noActivos'] = [];
  const listas: ListasClientes = { activos12m: [], nuevos: [], recuperados: [], inactivos: [], perdidos: [] };

  if (actividad) {
    const anioIni = `${anio}-01-01`;
    const prevIni = `${anio - 1}-01-01`;
    const conNetaAnio = actividad.filter((a) => Number(a.netaAnio) > 0);
    const conNetaPrev = actividad.filter((a) => Number(a.netaPrev) > 0);

    nuevos = conNetaAnio.filter((a) => a.primera !== null && a.primera >= anioIni).length;
    recuperados = conNetaAnio.filter(
      (a) => Number(a.netaPrev) <= 0 && a.primera !== null && a.primera < prevIni,
    ).length;
    retencion =
      conNetaPrev.length > 0
        ? (conNetaPrev.filter((a) => Number(a.netaAnio) > 0).length / conNetaPrev.length) * 100
        : null;

    for (const a of actividad) {
      if (!a.ultima) continue;
      const diasSin = Math.floor((hoy * DIA - Date.parse(a.ultima)) / DIA);
      if (diasSin > 730) perdidos += 1;
      else if (diasSin > 365) inactivos += 1;
    }

    const conDias: ClienteActividad[] = actividad.map((a) => ({
      id: a.cliente_id,
      nombre: nombreCliente.get(a.cliente_id) ?? '—',
      netaAnio: Number(a.netaAnio ?? 0),
      netaPrev: Number(a.netaPrev ?? 0),
      neta12m: Number(a.neta12m ?? 0),
      facturasAnio: Number(a.facturasAnio ?? 0),
      primera: a.primera,
      ultima: a.ultima,
      diasSin: a.ultima ? Math.floor((hoy * DIA - Date.parse(a.ultima)) / DIA) : null,
      comercial: nombreComercial.get(comercialDeCliente.get(a.cliente_id) ?? '') ?? null,
      margen: (() => {
        const neta = Number(a.netaAnio ?? 0);
        return neta - (costePorCliente.get(a.cliente_id) ?? 0);
      })(),
      margenPct: (() => {
        const neta = Number(a.netaAnio ?? 0);
        if (neta === 0) return null;
        return ((neta - (costePorCliente.get(a.cliente_id) ?? 0)) / neta) * 100;
      })(),
    }));

    listas.activos12m = conDias.filter((c) => c.neta12m > 0).sort((a, b) => b.neta12m - a.neta12m).slice(0, 500);
    listas.nuevos = conDias
      .filter((c) => c.netaAnio > 0 && c.primera !== null && c.primera >= anioIni)
      .sort((a, b) => b.netaAnio - a.netaAnio)
      .slice(0, 500);
    listas.recuperados = conDias
      .filter((c) => c.netaAnio > 0 && c.netaPrev <= 0 && c.primera !== null && c.primera < prevIni)
      .sort((a, b) => b.netaAnio - a.netaAnio)
      .slice(0, 500);
    listas.inactivos = conDias
      .filter((c) => c.diasSin !== null && c.diasSin > 365 && c.diasSin <= 730)
      .sort((a, b) => (b.diasSin ?? 0) - (a.diasSin ?? 0))
      .slice(0, 500);
    listas.perdidos = conDias
      .filter((c) => c.diasSin !== null && c.diasSin > 730)
      .sort((a, b) => (b.diasSin ?? 0) - (a.diasSin ?? 0))
      .slice(0, 500);

    noActivos = actividad
      .filter((a) => a.ultima !== null && Math.floor((hoy * DIA - Date.parse(a.ultima)) / DIA) > 365)
      .map((a) => ({
        id: a.cliente_id,
        nombre: nombreCliente.get(a.cliente_id) ?? '—',
        diasSin: Math.floor((hoy * DIA - Date.parse(a.ultima as string)) / DIA),
        ultimaFactura: a.ultima as string,
        comercial: nombreComercial.get(comercialDeCliente.get(a.cliente_id) ?? '') ?? null,
      }))
      .sort((a, b) => b.diasSin - a.diasSin)
      .slice(0, 10);
  } else {
    perdidos = clientes.filter((c) => c.estado === 'perdido' || c.estado === 'inactivo').length;
    const nuevosRaw = [...activos].filter((id) => !activosPrevio.has(id));
    nuevos = nuevosRaw.filter((id) => {
      const cli = clientes.find((c) => c.id === id);
      return !cli?.fecha_primer_pedido || cli.fecha_primer_pedido.slice(0, 4) === at;
    }).length;
    recuperados = nuevosRaw.length - nuevos;
    retencion = activosPrevio.size > 0 ? ([...activos].filter((id) => activosPrevio.has(id)).length / activosPrevio.size) * 100 : null;

    for (const c of clientes) {
      if (c.estado !== 'activo') continue;
      const fechas = fechasCliente.get(c.id);
      if (!fechas || fechas.size === 0) continue;
      const ultima = [...fechas].sort().reverse()[0];
      const diasSin = Math.round((hoy * DIA - Date.parse(ultima)) / DIA);
      if (diasSin > 365) {
        noActivos.push({
          id: c.id,
          nombre: c.nombre,
          diasSin,
          ultimaFactura: ultima,
          comercial: nombreComercial.get(c.comercial_id ?? '') ?? null,
        });
      }
    }
    noActivos.sort((a, b) => b.diasSin - a.diasSin);
    if (noActivos.length > 10) noActivos.length = 10;
  }

  const netaW1 = new Map<string, number>();
  const netaW2 = new Map<string, number>();
  for (const f of facturas) {
    if (!f.cliente_id) continue;
    const dia = Math.floor(Date.parse(f.fecha) / DIA);
    if (dia > hoy) continue;
    const base = Number(f.base_imponible ?? 0);
    if (dia > hoy - 365) netaW1.set(f.cliente_id, (netaW1.get(f.cliente_id) ?? 0) + base);
    else if (dia > hoy - 730) netaW2.set(f.cliente_id, (netaW2.get(f.cliente_id) ?? 0) + base);
  }
  const movimiento = [...new Set([...netaW1.keys(), ...netaW2.keys()])]
    .map((id) => {
      const actual = netaW1.get(id) ?? 0;
      const previa = netaW2.get(id) ?? 0;
      return { id, nombre: nombreCliente.get(id) ?? '—', netaActual: actual, netaPrevia: previa, delta: actual - previa, deltaPct: previa > 0 ? ((actual - previa) / previa) * 100 : null };
    })
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 12);

  const tabla = [...porCliente.entries()]
    .map(([id, v]) => ({
      id,
      nombre: nombreCliente.get(id) ?? '—',
      neta: v.neta,
      coste: costePorCliente.get(id) ?? 0,
      margen: v.neta - (costePorCliente.get(id) ?? 0),
      margenPct: v.neta !== 0 ? ((v.neta - (costePorCliente.get(id) ?? 0)) / v.neta) * 100 : null,
      facturas: v.facturas,
      ticket: v.facturas > 0 ? v.neta / v.facturas : 0,
      comercial: nombreComercial.get(comercialDeCliente.get(id) ?? '') ?? null,
    }))
    .sort((a, b) => b.neta - a.neta)
    .slice(0, 15);

  // Familias para las columnas de la matriz: ya vienen en el Promise.all.
  const familiasOrden = (((familiasRaw as { data: { familia: string }[] | null } | null)?.data ?? []) as { familia: string }[])
    .map((f) => f.familia)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));

  const familiasCliente = new Map<string, Set<string>>();
  // Solo las líneas de los 12 clientes de la matriz.
  const top12Ids = [...porCliente.entries()]
    .sort((a, b) => b[1].neta - a[1].neta)
    .slice(0, 12)
    .map(([id]) => id);
  const top12 = new Set(top12Ids);
  const idsFacturasTop = idsFacturasAnio.filter((fid) => top12.has(clienteDeFactura.get(fid) ?? ''));
  const lineasClientes: FilaLinea[] = [];
  for (let i = 0; i < idsFacturasTop.length; i += 200) {
    const { data } = await supabase
      .from('factura_lineas')
      .select('factura_id, articulo_id')
      .in('factura_id', idsFacturasTop.slice(i, i + 200));
    if (data) lineasClientes.push(...(data as unknown as FilaLinea[]));
  }

  const familiaDeArticulo = new Map<string, string | null>();
  if (lineasClientes.length) {
    const idsArticulo = [...new Set(lineasClientes.map((l) => l.articulo_id).filter((x): x is string => Boolean(x)))];
    for (let i = 0; i < idsArticulo.length; i += 200) {
      const { data } = await supabase
        .from('articulos')
        .select('id, familia')
        .in('id', idsArticulo.slice(i, i + 200));
      for (const a of (data ?? []) as { id: string; familia: string | null }[]) {
        familiaDeArticulo.set(a.id, a.familia);
      }
    }
  }
  if (lineasClientes.length) {
    for (const l of lineasClientes) {
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
      compradas: familiasOrden.map((fam) => familiasCliente.get(id)?.has(fam) ?? false),
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
    inactivos,
    retencion,
    tabla,
    familias: familiasOrden,
    matriz,
    semaforo,
    noActivos,
    movimiento,
    listas,
  };
}