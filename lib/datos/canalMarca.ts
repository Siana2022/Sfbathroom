import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getRol, puedeVerMargenes } from '@/lib/datos/role';
import { filtrarPorIds, getFacturaIdsFiltradas, hayFiltros, type Filtros } from '@/lib/datos/filtros';
import { lineasPorFacturas } from '@/lib/datos/lineas';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';
import { ventasAnioRpc } from '@/lib/datos/ventas';

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

export type MarcaBlancaCliente = { cliente: string; importe: number; pct: number; margen: number; margenPct: number | null };

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
  objetivoAnual: number;
  calidad: { importeSinMarca: number; pctSinMarca: number; importeSinCanal: number; pctSinCanal: number };
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
  codigoEmpresa: string,
  empresaId: string,
  anio: number,
  anioPrevio: number,
  clientesCanal: Map<string, string | null>,
  canalNombre: Map<string, string>,
  filtros?: Filtros,
) {
  // Camino rápido sin filtros: facturas + líneas de los dos ejercicios en dos llamadas
  // (RPC ventas_anio por año) en vez de decenas de round-trips.
  const sinFiltros = !filtros || !hayFiltros(filtros);
  let facturas: FilaFactura[] | null = null;
  let lineas: FilaLinea[] | null = null;
  if (sinFiltros) {
    const [va, vaPrev] = await Promise.all([
      ventasAnioRpc(supabase, codigoEmpresa, anio),
      ventasAnioRpc(supabase, codigoEmpresa, anioPrevio),
    ]);
    if (va && vaPrev) {
      facturas = [...va.facturas, ...vaPrev.facturas] as unknown as FilaFactura[];
      lineas = [...va.lineas, ...vaPrev.lineas] as unknown as FilaLinea[];
    }
  }
  if (!facturas || !lineas) {
    const idsFiltrados = await getFacturaIdsFiltradas(supabase, empresaId, filtros ?? {}, `${anioPrevio}-01-01`, `${anio}-12-31`);
    const facturasRaw = await todasLasFilas<FilaFactura>((desde) =>
      supabase
        .from('facturas')
        .select('id, cliente_id, fecha')
        .eq('empresa_id', empresaId)
        .in('tipo_documento', ['factura', 'abono', 'nota_cargo'])
        .gte('fecha', `${anioPrevio}-01-01`)
        .lte('fecha', `${anio}-12-31`)
        .range(desde, desde + TAMANO_PAGINA - 1)
    );
    facturas = filtrarPorIds(facturasRaw, idsFiltrados);
    lineas = await lineasPorFacturas<FilaLinea>(supabase, 'factura_id, articulo_id, cantidad, importe, coste_unitario', facturas.map((f) => f.id));
  }

  const costeLoteFilas = await todasLasFilas<{ articulo_id: string; coste_completo_unitario: number | null; cantidad: number | null }>((desde) =>
    supabase
      .from('v_coste_completo_por_lote')
      .select('articulo_id, coste_completo_unitario, cantidad')
      .eq('empresa_id', empresaId)
      .range(desde, desde + TAMANO_PAGINA - 1),
  );
  const costeLoteSum = new Map<string, { suma: number; qty: number }>();
  for (const l of costeLoteFilas) {
    const v = costeLoteSum.get(l.articulo_id) ?? { suma: 0, qty: 0 };
    v.suma += Number(l.coste_completo_unitario ?? 0) * Number(l.cantidad ?? 0);
    v.qty += Number(l.cantidad ?? 0);
    costeLoteSum.set(l.articulo_id, v);
  }
  const costeMedioArticulo = new Map<string, number>();
  for (const [id, v] of costeLoteSum) if (v.qty > 0) costeMedioArticulo.set(id, v.suma / v.qty);

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
  const mbCliente = new Map<string, { importe: number; coste: number }>();

  for (const l of lineas) {
    const importe = Number(l.importe ?? 0);
    const cantidad = Number(l.cantidad ?? 0);
    const fi = facturaAnio.get(l.factura_id);
    const a = l.articulo_id ? articuloMap.get(l.articulo_id) : null;
    const nombreMarca = (a?.marca_id && marcaNombre.get(a.marca_id)) ?? 'Sin marca';
    const costeUnit =
      Number(l.coste_unitario ?? 0) ||
      (l.articulo_id ? (costeMedioArticulo.get(l.articulo_id) ?? 0) : 0) ||
      Number(a?.coste_unitario ?? 0);
    const coste = cantidad * costeUnit;
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
      const mbv = mbCliente.get(a.marca_blanca_cliente_id) ?? { importe: 0, coste: 0 };
      mbv.importe += importe;
      mbv.coste += coste;
      mbCliente.set(a.marca_blanca_cliente_id, mbv);
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

  const { data: objetivoRaw } = await supabase
    .from('alertas_config')
    .select('umbral')
    .eq('modulo', 'ventas')
    .eq('nombre', 'objetivo_starbath')
    .maybeSingle();
  const objetivoAnual = Number((objetivoRaw as { umbral: number | null } | null)?.umbral ?? 0);

  const sb = porMarca.find((s) => s.marca === NOMBRE_SB);
  const mb = porMarca.find((s) => s.marca !== NOMBRE_SB && s.marca !== 'Sin marca');

  return {
    porMarca,
    porCanal,
    pctStarbath: sb?.pct ?? null,
    pctStarbathMensual: ventana.map((mes) => ({ mes, sb: mensual.get(mes)!.sb, mb: mensual.get(mes)!.mb })),
    objetivoAnual,
    marcaBlancaPorCliente: [...mbCliente.entries()]
      .map(([id, v]) => ({
        cliente: clienteNombre.get(id) ?? '—',
        importe: v.importe,
        pct: total > 0 ? (v.importe / total) * 100 : 0,
        margen: v.importe - v.coste,
        margenPct: v.importe > 0 ? ((v.importe - v.coste) / v.importe) * 100 : null,
      }))
      .sort((a, b) => b.importe - a.importe),
    calidad: {
      importeSinMarca: porMarca.find((s) => s.marca === 'Sin marca')?.importe ?? 0,
      pctSinMarca: total > 0 ? ((porMarca.find((s) => s.marca === 'Sin marca')?.importe ?? 0) / total) * 100 : 0,
      importeSinCanal: porCanal.find((c) => c.canal === 'Sin canal')?.importe ?? 0,
      pctSinCanal: total > 0 ? ((porCanal.find((c) => c.canal === 'Sin canal')?.importe ?? 0) / total) * 100 : 0,
    },
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

  const r = await getSegmentos(supabase, codigoEmpresa, empresa.id, anio, anioPrevio, clienteCanal, canalNombre, filtros);

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