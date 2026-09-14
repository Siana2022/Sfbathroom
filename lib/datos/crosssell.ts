import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

type Recomendacion = {
  familia: string;
  articulos: { nombre: string; veces: number }[];
  afinidad: number; // % de clientes compradores de A que también compran de esta familia
};

type FilaLinea = { factura_id: string; articulo_id: string | null };
type FilaArticulo = { id: string; familia_id: string | null };
type FilaFamilia = { id: string; nombre: string };

/**
 * Cross-sell por afinidad de familias: para el cliente dado, detecta las familias que
 * compran clientes "similares" (afinidad por co-ocurrencia) y que este cliente aún no
 * compra, mostrando ejemplos de artículos.
 */
export async function getCrossSell(codigoEmpresa: string, clienteId: string, anio: number): Promise<Recomendacion[]> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: familiasFilas } = await supabase.from('familias_articulo').select('id, nombre').eq('empresa_id', empresa.id);
  const familias = (familiasFilas ?? []) as FilaFamilia[];

  const { data: articulosFilas } = await supabase.from('articulos').select('id, familia_id');
  const familiaDeArticulo = new Map<string, string | null>((articulosFilas ?? [] as FilaArticulo[]).map((a) => [a.id, a.familia_id]));

  // facturas del año con cliente
  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, cliente_id')
    .eq('empresa_id', empresa.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const filasF = (facturas ?? []) as { id: string; cliente_id: string | null }[];
  const clienteDeFactura = new Map(filasF.filter((f) => f.cliente_id).map((f) => [f.id, f.cliente_id!]));

  // familias compradas por cliente (año actual, clientes con >= 2 facturas = "establecidos")
  const familiasPorCliente = new Map<string, Set<string>>();
  const nFacturasCliente = new Map<string, number>();
  const idsAnio = filasF.map((f) => f.id);
  for (let i = 0; i < idsAnio.length; i += 150) {
    const lote = idsAnio.slice(i, i + 150);
    const { data: lineas } = await supabase.from('factura_lineas').select('factura_id, articulo_id').in('factura_id', lote);
    for (const l of (lineas ?? []) as FilaLinea[]) {
      const cli = clienteDeFactura.get(l.factura_id);
      const fam = l.articulo_id ? familiaDeArticulo.get(l.articulo_id) : null;
      if (!cli || !fam) continue;
      const s = familiasPorCliente.get(cli) ?? new Set<string>();
      s.add(fam);
      familiasPorCliente.set(cli, s);
      nFacturasCliente.set(cli, (nFacturasCliente.get(cli) ?? 0) + 1);
    }
  }

  // co-ocurrencia por pares de familias
  const parA = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const coOcurrencia = new Map<string, { a: string; b: string; n: number }>();
  const compradoresFamilia = new Map<string, number>();
  for (const [cli, fams] of familiasPorCliente) {
    if ((nFacturasCliente.get(cli) ?? 0) < 2) continue;
    const arr = [...fams];
    for (const f of arr) compradoresFamilia.set(f, (compradoresFamilia.get(f) ?? 0) + 1);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const k = parA(arr[i], arr[j]);
        const p = coOcurrencia.get(k) ?? { a: arr[i], b: arr[j], n: 0 };
        p.n += 1;
        coOcurrencia.set(k, p);
      }
    }
  }

  const famsCliente = familiasPorCliente.get(clienteId) ?? new Set<string>();
  if (famsCliente.size === 0) return [];

  const nombres = new Map(familias.map((f) => [f.id, f.nombre]));
  const clientesFamiliaBase = [...famsCliente].reduce((s, f) => s + (compradoresFamilia.get(f) ?? 0), 0);

  // afinidad: para cada familia no comprada, % de veces que aparece junto a alguna de las del cliente
  const afinidad = new Map<string, number>();
  for (const p of coOcurrencia.values()) {
    if (famsCliente.has(p.a)) {
      if (!famsCliente.has(p.b)) afinidad.set(p.b, (afinidad.get(p.b) ?? 0) + p.n);
    } else if (famsCliente.has(p.b)) {
      afinidad.set(p.a, (afinidad.get(p.a) ?? 0) + p.n);
    }
  }

  const candidatas = [...afinidad.entries()]
    .filter(([f]) => nombres.has(f))
    .map(([fid, n]) => ({ fid, afinidad: clientesFamiliaBase > 0 ? (n / clientesFamiliaBase) * 100 : 0 }))
    .sort((a, b) => b.afinidad - a.afinidad)
    .slice(0, 5);

  const articulosPorFamilia = new Map<string, Map<string, number>>();
  for (let i = 0; i < idsAnio.length; i += 150) {
    const lote = idsAnio.slice(i, i + 150);
    const { data: lineas } = await supabase.from('factura_lineas').select('factura_id, articulo_id, cantidad').in('factura_id', lote);
    for (const l of (lineas ?? []) as { factura_id: string; articulo_id: string | null; cantidad: number }[]) {
      const fam = l.articulo_id ? familiaDeArticulo.get(l.articulo_id) : null;
      if (!fam || !l.articulo_id) continue;
      const m = articulosPorFamilia.get(fam) ?? new Map<string, number>();
      m.set(l.articulo_id, (m.get(l.articulo_id) ?? 0) + Number(l.cantidad ?? 0));
      articulosPorFamilia.set(fam, m);
    }
  }

  const recomendaciones: Recomendacion[] = [];
  for (const cand of candidatas) {
    const arts = articulosPorFamilia.get(cand.fid);
    const idsArts = arts ? [...arts.keys()] : [];
    const nombresArts = idsArts.length
      ? (await supabase.from('articulos').select('id, nombre').in('id', idsArts)).data ?? []
      : [];
    const topArticulos = (arts
      ? [...arts.entries()]
          .map(([id, veces]) => {
            const nombre = (nombresArts as { id: string; nombre: string }[] | null)?.find((a) => a.id === id)?.nombre;
            return nombre ? { nombre, veces } : null;
          })
          .filter((a): a is { nombre: string; veces: number } => a !== null)
          .sort((a, b) => b.veces - a.veces)
          .slice(0, 3)
      : []) as Recomendacion['articulos'];
    recomendaciones.push({
      familia: nombres.get(cand.fid) ?? cand.fid,
      afinidad: cand.afinidad,
      articulos: topArticulos,
    });
  }
  return recomendaciones;
}