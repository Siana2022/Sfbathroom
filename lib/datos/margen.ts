import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getRol, puedeVerMargenes } from '@/lib/datos/role';

export type MargenData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  sinAcceso: boolean;
  importeVendido: number;
  costeVenta: number;
  margen: number;
  margenPct: number;
  porFamilia: { familia: string; importe: number; coste: number; margen: number; margenPct: number }[];
  porArticulo: { articulo: string; unidades: number; importe: number; margen: number; margenPct: number }[];
  ultimosLotes: { lote: string; articulo: string; fecha: string; costeCompra: number; costeRepartido: number; costeCompleto: number }[];
};

type FilaLinea = { factura_id: string; articulo_id: string | null; cantidad: number; importe: number; coste_unitario: number | null };
type FilaArticulo = { id: string; nombre: string; familia_id: string | null; coste_unitario: number | null };
type FilaFamilia = { id: string; nombre: string };

export async function getMargen(codigoEmpresa: string, anio: number): Promise<MargenData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const rol = await getRol();
  if (!puedeVerMargenes(rol)) {
    return {
      empresa,
      anio,
      sinAcceso: true,
      importeVendido: 0,
      costeVenta: 0,
      margen: 0,
      margenPct: 0,
      porFamilia: [],
      porArticulo: [],
      ultimosLotes: [],
    };
  }

  const { data: facturasIds } = await supabase
    .from('facturas')
    .select('id')
    .eq('empresa_id', empresa.id)
    .eq('tipo_documento', 'factura')
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const ids = (facturasIds ?? []).map((f) => (f as { id: string }).id);

  const { data: lineas } = ids.length
    ? await supabase.from('factura_lineas').select('factura_id, articulo_id, cantidad, importe, coste_unitario').in('factura_id', ids)
    : { data: [] };
  const filasLineas = (lineas ?? []) as FilaLinea[];

  const { data: articulos } = await supabase
    .from('articulos')
    .select('id, nombre, familia_id, coste_unitario')
    .eq('empresa_id', empresa.id);
  const familiasMap = new Map<string, string>();
  {
    const { data: familias } = await supabase.from('familias_articulo').select('id, nombre');
    for (const f of (familias ?? []) as FilaFamilia[]) familiasMap.set(f.id, f.nombre);
  }
  const articuloPorId = new Map((articulos ?? []).map((a) => [a.id, a as FilaArticulo]));

  const porFamiliaRaw = new Map<string, { importe: number; coste: number }>();
  const porArticuloRaw = new Map<string, { nombre: string; unidades: number; importe: number; coste: number }>();
  let importeVendido = 0;
  let costeVenta = 0;

  for (const l of filasLineas) {
    const a = l.articulo_id ? articuloPorId.get(l.articulo_id) : undefined;
    const importe = Number(l.importe ?? 0);
    const costeUnit = Number(l.coste_unitario ?? (a?.coste_unitario as number | undefined) ?? 0);
    const coste = Number(l.cantidad ?? 0) * costeUnit;
    importeVendido += importe;
    costeVenta += coste;

    const fam = (a?.familia_id && familiasMap.get(a.familia_id)) ?? 'Sin familia';
    const fRaw = porFamiliaRaw.get(fam) ?? { importe: 0, coste: 0 };
    fRaw.importe += importe;
    fRaw.coste += coste;
    porFamiliaRaw.set(fam, fRaw);

    const key = a?.id ?? l.factura_id;
    const aRaw = porArticuloRaw.get(key) ?? { nombre: a?.nombre ?? '—', unidades: 0, importe: 0, coste: 0 };
    aRaw.unidades += Number(l.cantidad ?? 0);
    aRaw.importe += importe;
    aRaw.coste += coste;
    porArticuloRaw.set(key, aRaw);
  }

  const porFamilia = [...porFamiliaRaw.entries()]
    .map(([familia, v]) => ({ familia, importe: v.importe, coste: v.coste, margen: v.importe - v.coste, margenPct: v.importe > 0 ? ((v.importe - v.coste) / v.importe) * 100 : 0 }))
    .sort((a, b) => b.importe - a.importe);

  const porArticulo = [...porArticuloRaw.entries()]
    .map(([, v]) => ({ articulo: v.nombre, unidades: v.unidades, importe: v.importe, margen: v.importe - v.coste, margenPct: v.importe > 0 ? ((v.importe - v.coste) / v.importe) * 100 : 0 }))
    .sort((a, b) => b.margen - a.margen)
    .slice(0, 10);

  const { data: lotesRaw } = await supabase
    .from('v_coste_completo_por_lote')
    .select('lote_id, articulo, fecha_compra, coste_unitario_compra, coste_repartido_unitario, coste_completo_unitario')
    .eq('empresa_id', empresa.id)
    .order('fecha_compra', { ascending: false });
  const ultimosLotes = ((lotesRaw ?? []) as { lote_id: string; articulo: string; fecha_compra: string; coste_unitario_compra: number; coste_repartido_unitario: number; coste_completo_unitario: number }[])
    .slice(0, 8)
    .map((l) => ({
      lote: l.lote_id.slice(0, 8),
      articulo: l.articulo,
      fecha: l.fecha_compra,
      costeCompra: Number(l.coste_unitario_compra),
      costeRepartido: Number(l.coste_repartido_unitario),
      costeCompleto: Number(l.coste_completo_unitario),
    }));

  const margen = importeVendido - costeVenta;
  return {
    empresa,
    anio,
    sinAcceso: false,
    importeVendido,
    costeVenta,
    margen,
    margenPct: importeVendido > 0 ? (margen / importeVendido) * 100 : 0,
    porFamilia,
    porArticulo,
    ultimosLotes,
  };
}