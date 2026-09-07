import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type CanalMarcaData = {
  empresa: { id: string; codigo: string; nombre: string };
  anio: number;
  porMarca: { marca: string; importe: number; pct: number }[];
  porCanal: { canal: string; importe: number; pct: number }[];
  pctStarbath: number | null;
};

type FilaFactura = { id: string; cliente_id: string | null };
type FilaLinea = { factura_id: string; articulo_id: string | null; importe: number };
type FilaArticulo = { id: string; marca_id: string | null };
type FilaMarca = { id: string; nombre: string };
type FilaCliente = { id: string; canal_id: string | null };
type FilaCanal = { id: string; nombre: string };

export async function getCanalMarca(codigoEmpresa: string, anio: number): Promise<CanalMarcaData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: facturasRaw } = await supabase
    .from('facturas')
    .select('id, cliente_id')
    .eq('empresa_id', empresa.id)
    .eq('tipo_documento', 'factura')
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const facturas = (facturasRaw ?? []) as FilaFactura[];
  const ids = facturas.map((f) => f.id);

  const { data: lineasRaw } = ids.length ? await supabase.from('factura_lineas').select('factura_id, articulo_id, importe').in('factura_id', ids) : { data: [] };
  const lineas = (lineasRaw ?? []) as FilaLinea[];

  const { data: articulosRaw } = await supabase.from('articulos').select('id, marca_id').eq('empresa_id', empresa.id);
  const marcaDeArticulo = new Map((articulosRaw ?? []).map((a) => [a.id, a as FilaArticulo]));

  const marcaNombre = new Map<string, string>();
  {
    const { data: marcas } = await supabase.from('marcas').select('id, nombre');
    for (const m of (marcas ?? []) as FilaMarca[]) marcaNombre.set(m.id, m.nombre);
  }

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

  const porMarca = new Map<string, number>();
  const porCanal = new Map<string, number>();

  // línea -> factura -> cliente -> canal
  const facturaInfo = new Map(facturas.map((f) => [f.id, f]));
  for (const l of lineas) {
    const importe = Number(l.importe ?? 0);
    if (l.articulo_id) {
      const marcaId = marcaDeArticulo.get(l.articulo_id)?.marca_id;
      const nombre = (marcaId && marcaNombre.get(marcaId)) ?? 'Sin marca';
      porMarca.set(nombre, (porMarca.get(nombre) ?? 0) + importe);
    }
    const cf = facturaInfo.get(l.factura_id);
    if (cf?.cliente_id) {
      const canalId = clienteCanal.get(cf.cliente_id);
      const nombre = (canalId && canalNombre.get(canalId)) ?? 'Sin canal';
      porCanal.set(nombre, (porCanal.get(nombre) ?? 0) + importe);
    }
  }

  const total = [...porMarca.values()].reduce((a, b) => a + b, 0);
  const porMarcaRes = [...porMarca.entries()]
    .map(([marca, importe]) => ({ marca, importe, pct: total > 0 ? (importe / total) * 100 : 0 }))
    .sort((a, b) => b.importe - a.importe);
  const porCanalRes = [...porCanal.entries()]
    .map(([canal, importe]) => ({ canal, importe, pct: total > 0 ? (importe / total) * 100 : 0 }))
    .sort((a, b) => b.importe - a.importe);

  return {
    empresa,
    anio,
    porMarca: porMarcaRes,
    porCanal: porCanalRes,
    pctStarbath: porMarcaRes.find((m) => m.marca === 'Starbath Plus')?.pct ?? null,
  };
}