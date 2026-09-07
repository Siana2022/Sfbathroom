import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getRol, puedeVerMargenes } from '@/lib/datos/role';
import { filtrarPorIds, getFacturaIdsFiltradas, type Filtros } from '@/lib/datos/filtros';

export type Segmento = {
  marca: string;
  importe: number;
  pct: number;
  unidades: number;
  precioMedio: number;
  clientes: number;
  referencias: number;
  importePrevio: number;
  crecimientoPct: number | null;
  peso12m: number | null;
  margenPct: number | null;
  margenAbs: number | null;
};

export type MarcaBlancaCliente = { cliente: string; importe: number; pct: number };

export type CanalMarcaData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  sinAccesoMargen: boolean;
  porMarca: Segmento[];
  porCanal: { canal: string; importe: number; pct: number }[];
  pctStarbath: number | null;
  pctStarbathMensual: { mes: string; sb: number; mb: number }[];
  diferencialMargen: { sb: number | null; mb: number | null; diffPct: number | null; diffEuros: number | null };
  marcaBlancaPorCliente: MarcaBlancaCliente[];
};

type FilaFactura = { id: string; cliente_id: string | null; fecha: string };
type FilaLinea = { factura_id: string; articulo_id: string | null; cantidad: number; importe: number; coste_unitario: number | null };
type FilaArticulo = { id: string; marca_id: string | null; marca_blanca_cliente_id: string | null; coste_unitario: number | null };
type FilaMarca = { id: string; nombre: string };
type FilaCliente = { id: string; canal_id: string | null };
type FilaCanal = { id: string; nombre: string };

const NOMBRE_SB = 'Starbath Plus';

type SegmentoAgregado = Omit<Segmento, 'pct' | 'precioMedio' | 'crecimientoPct' | 'peso12m' | 'margenPct' | 'margenAbs'> & {
  coste: number;
  clientesSet: Set<string>;
  referenciasSet: Set<string>;
};

async function getSegmentos(
  supabase: ReturnType<typeof createClient>,
  empresaId: string,
  anio: number,
  anioPrevio: number,
  clientesCanal: Map<string, string | null>,
  canalNombre: Map<string, string>,
  filtros?: Filtros,
) {
  const idsFiltrados = await getFacturaIdsFiltradas(supabase, empresaId, filtros ?? {}, `${anioPrevio}-01-01`, `${anio}-12-31`);

  const { data: facturasRaw } = await supabase
    .from('facturas')
    .select('id, cliente_id, fecha')
    .eq('empresa_id', empresaId)
    .eq('tipo_documento', 'factura')
    .gte('fecha', `${anioPrevio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const facturas = filtrarPorIds((facturasRaw ?? []) as FilaFactura[], idsFiltrados);
  const ids = facturas.map((f) => f.id);

  const { data: lineasRaw } = ids.length
    ? await supabase.from('factura_lineas').select('factura_id, articulo_id, cantidad, importe, coste_unitario').in('factura_id', ids)
    : { data: [] };
  const lineas = (lineasRaw ?? []) as FilaLinea[];

  const { data: articulosRaw } = await supabase.from('articulos').select('id, marca_id, marca_blanca_cliente_id, coste_unitario').eq('empresa_id', empresaId);
  const articulos = (articulosRaw ?? []) as FilaArticulo[];
  const articuloMap = new Map(articulos.map((a) => [a.id, a]));

  const marcaNombre = new Map<string, string>();
  {
    const { data: marcas } = await supabase.from('marcas').select('id, nombre');
    for (const m of (marcas ?? []) as FilaMarca[]) marcaNombre.set(m.id, m.nombre);
  }

  const clienteNombre = new Map<string, string>();
  {
    const { data: clis } = await supabase.from('clientes').select('id, nombre').eq('empresa_id', empresaId);
    for (const c of clis ?? []) clienteNombre.set((c as { id: string }).id, (c as { nombre: string }).nombre);
  }

  const facturaAnio = new Map(facturas.map((f) => [f.id, Number(f.fecha.slice(0, 4))]));
  const facturaCliente = new Map(facturas.map((f) => [f.id, f.cliente_id]));
  const facturaMes = new Map(facturas.map((f) => [f.id, f.fecha.slice(0, 7)]));

  const seg = new Map<string, SegmentoAgregado>();
  const segPrevio = new Map<string, { importe: number }>();
  const mensual = new Map<string, { sb: number; mb: number }>();
  const mbCliente = new Map<string, number>();

  for (const l of lineas) {
    const importe = Number(l.importe ?? 0);
    const cantidad = Number(l.cantidad ?? 0);
    const fi = facturaAnio.get(l.factura_id);
    const a = l.articulo_id ? articuloMap.get(l.articulo_id) : null;
    const nombreMarca = (a?.marca_id && marcaNombre.get(a.marca_id)) ?? 'Sin marca';
    const coste = cantidad * Number(l.coste_unitario ?? a?.coste_unitario ?? 0);
    const mes = facturaMes.get(l.factura_id);

    if (fi === anio) {
      const s = seg.get(nombreMarca) ?? {
        marca: nombreMarca,
        importe: 0,
        unidades: 0,
        clientes: 0,
        referencias: 0,
        importePrevio: 0,
        clientesSet: new Set<string>(),
        referenciasSet: new Set<string>(),
        coste: 0,
      };
      s.importe += importe;
      s.unidades += cantidad;
      s.coste += coste;
      if (l.articulo_id) s.referenciasSet.add(l.articulo_id);
      const cli = facturaCliente.get(l.factura_id);
      if (cli) s.clientesSet.add(cli);
      seg.set(nombreMarca, s);
    } else if (fi === anioPrevio) {
      const p = segPrevio.get(nombreMarca) ?? { importe: 0 };
      p.importe += importe;
      segPrevio.set(nombreMarca, p);
    }

    if (a?.marca_id && mes) {
      const esSb = marcaNombre.get(a.marca_id) === NOMBRE_SB;
      const m = mensual.get(mes) ?? { sb: 0, mb: 0 };
      if (esSb) m.sb += importe;
      else m.mb += importe;
      mensual.set(mes, m);
    }

    if (a?.marca_blanca_cliente_id && facturaCliente.get(l.factura_id) === a.marca_blanca_cliente_id) {
      mbCliente.set(a.marca_blanca_cliente_id, (mbCliente.get(a.marca_blanca_cliente_id) ?? 0) + importe);
    }
  }

  const total = [...seg.values()].reduce((acc, s) => acc + s.importe, 0);

  const porMarca: Segmento[] = [...seg.values()].map((s) => {
    const previo = segPrevio.get(s.marca);
    return {
      marca: s.marca,
      importe: s.importe,
      pct: total > 0 ? (s.importe / total) * 100 : 0,
      unidades: s.unidades,
      precioMedio: s.unidades > 0 ? s.importe / s.unidades : 0,
      clientes: s.clientesSet.size,
      referencias: s.referenciasSet.size,
      importePrevio: previo?.importe ?? 0,
      crecimientoPct: previo && previo.importe > 0 ? ((s.importe - previo.importe) / previo.importe) * 100 : null,
      peso12m: null,
      margenPct: s.importe > 0 ? ((s.importe - s.coste) / s.importe) * 100 : null,
      margenAbs: s.importe - s.coste,
    };
  }).sort((a, b) => b.importe - a.importe);

  // peso relativo acumulado en los últimos 12 meses (ventana rodante) por segmento
  const mesesOrden = [...mensual.keys()].sort();
  const ventana = mesesOrden.slice(-12);
  if (ventana.length > 0) {
    const acc = { sb: 0, mb: 0 };
    for (const mes of ventana) {
      const m = mensual.get(mes)!;
      acc.sb += m.sb;
      acc.mb += m.mb;
    }
    const totVentana = acc.sb + acc.mb;
    if (totVentana > 0) {
      for (const s of porMarca) {
        const esSb = s.marca === NOMBRE_SB;
        s.peso12m = (esSb ? acc.sb : acc.mb) / totVentana * 100;
      }
    }
  }

  const porCanalMap = new Map<string, number>();
  for (const l of lineas) {
    if (facturaAnio.get(l.factura_id) !== anio) continue;
    const cli = facturaCliente.get(l.factura_id);
    if (!cli) continue;
    const canalId = clientesCanal.get(cli);
    const nombre = (canalId && canalNombre.get(canalId)) ?? 'Sin canal';
    porCanalMap.set(nombre, (porCanalMap.get(nombre) ?? 0) + Number(l.importe ?? 0));
  }
  const porCanal = [...porCanalMap.entries()]
    .map(([canal, importe]) => ({ canal, importe, pct: total > 0 ? (importe / total) * 100 : 0 }))
    .sort((a, b) => b.importe - a.importe);

  const sb = porMarca.find((s) => s.marca === NOMBRE_SB);
  const mb = porMarca.find((s) => s.marca !== NOMBRE_SB && s.marca !== 'Sin marca');

  return {
    porMarca,
    porCanal,
    pctStarbath: sb?.pct ?? null,
    pctStarbathMensual: ventana.map((mes) => ({ mes, sb: mensual.get(mes)!.sb, mb: mensual.get(mes)!.mb })),
    marcaBlancaPorCliente: [...mbCliente.entries()]
      .map(([id, importe]) => ({ cliente: clienteNombre.get(id) ?? '—', importe, pct: total > 0 ? (importe / total) * 100 : 0 }))
      .sort((a, b) => b.importe - a.importe),
    diferencialMargen: {
      sb: sb?.margenPct ?? null,
      mb: mb?.margenPct ?? null,
      diffPct: sb?.margenPct != null && mb?.margenPct != null ? sb.margenPct - mb.margenPct : null,
      diffEuros: sb?.margenAbs != null && mb?.margenAbs != null ? sb.margenAbs - mb.margenAbs : null,
    },
  };
}

export async function getCanalMarca(codigoEmpresa: string, anio: number, filtros?: Filtros): Promise<CanalMarcaData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const anioPrevio = anio - 1;
  const rol = await getRol();
  const sinAccesoMargen = !puedeVerMargenes(rol);

  const clienteCanal = new Map<string, string | null>();
  {
    const { data: clientes } = await supabase.from('clientes').select('id, canal_id').eq('empresa_id', empresa.id);
    for (const c of (clientes ?? []) as FilaCliente[]) clienteCanal.set(c.id, c.canal_id);
  }
  const canalNombre = new Map<string, string>();
  {
    const { data: canales } = await supabase.from('canales').select('id, nombre');
    for (const c of (canales ?? []) as FilaCanal[]) canalNombre.set(c.id, c.nombre);
  }

  const r = await getSegmentos(supabase, empresa.id, anio, anioPrevio, clienteCanal, canalNombre, filtros);

  if (sinAccesoMargen) {
    for (const s of r.porMarca) {
      s.margenPct = null;
      s.margenAbs = null;
    }
    r.diferencialMargen = { sb: null, mb: null, diffPct: null, diffEuros: null };
  }

  return {
    empresa,
    anio,
    sinAccesoMargen,
    ...r,
  };
}