import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { enLotes, todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';

type Recomendacion = {
  familia: string;
  articulos: { nombre: string; veces: number }[];
  afinidad: number; // % de clientes compradores de A que también compran de esta familia
};

type FilaLinea = { factura_id: string; articulo_id: string | null };
type FilaArticulo = { id: string; familia: string | null };

/**
 * Cross-sell por afinidad de familias: para el cliente dado, detecta las familias que
 * compran clientes "similares" (afinidad por co-ocurrencia) y que este cliente aún no
 * compra, mostrando ejemplos de artículos.
 */
export async function getCrossSell(codigoEmpresa: string, clienteId: string, anio: number): Promise<Recomendacion[]> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const articulosFilas = await todasLasFilas<FilaArticulo>((desde) =>
    supabase
      .from('articulos')
      .select('id, familia')
      .eq('empresa_id', empresa.id)
      .range(desde, desde + TAMANO_PAGINA - 1)
  );
  const familiaDeArticulo = new Map<string, string | null>(articulosFilas.map((a) => [a.id, a.familia]));

  // facturas del año con cliente
  const filasF = await todasLasFilas<{ id: string; cliente_id: string | null }>((desde) =>
    supabase
      .from('facturas')
      .select('id, cliente_id')
      .eq('empresa_id', empresa.id)
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`)
      .range(desde, desde + TAMANO_PAGINA - 1)
  );
  const clienteDeFactura = new Map(filasF.filter((f) => f.cliente_id).map((f) => [f.id, f.cliente_id!]));

  // familias compradas por cliente (año actual, clientes con >= 2 facturas = "establecidos")
  const familiasPorCliente = new Map<string, Set<string>>();
  const facturasUnicasCliente = new Map<string, Set<string>>();
  const idsAnio = filasF.map((f) => f.id);
  {
    const lineasAll = await enLotes<FilaLinea>(
      (lote, desde) =>
        supabase
          .from('factura_lineas')
          .select('factura_id, articulo_id')
          .in('factura_id', lote)
          .range(desde, desde + TAMANO_PAGINA - 1),
      idsAnio,
    );
    for (const l of lineasAll) {
      const cli = clienteDeFactura.get(l.factura_id);
      const fam = l.articulo_id ? familiaDeArticulo.get(l.articulo_id) : null;
      if (!cli || !fam) continue;
      const s = familiasPorCliente.get(cli) ?? new Set<string>();
      s.add(fam);
      familiasPorCliente.set(cli, s);
      const factSet = facturasUnicasCliente.get(cli) ?? new Set<string>();
      factSet.add(l.factura_id);
      facturasUnicasCliente.set(cli, factSet);
    }
  }

  // co-ocurrencia por pares de familias (client-level, con clientes únicos)
  const parA = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const coOcurrencia = new Map<string, { a: string; b: string; clientes: Set<string> }>();
  const compradoresFamilia = new Map<string, number>();
  for (const [cli, fams] of familiasPorCliente) {
    if ((facturasUnicasCliente.get(cli)?.size ?? 0) < 2) continue;
    const arr = [...fams];
    for (const f of arr) compradoresFamilia.set(f, (compradoresFamilia.get(f) ?? 0) + 1);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const k = parA(arr[i], arr[j]);
        const p = coOcurrencia.get(k) ?? { a: arr[i], b: arr[j], clientes: new Set<string>() };
        p.clientes.add(cli);
        coOcurrencia.set(k, p);
      }
    }
  }

  const famsCliente = familiasPorCliente.get(clienteId) ?? new Set<string>();
  if (famsCliente.size === 0) return [];

  // afinidad: para cada familia target, cuántos clientes únicos que compran alguna
  // de las familias del cliente TARGET TAMBIÉN compran la familia target.
  // Base = compradoresFamilia[target] (denominador por familia, no acumulado).
  const afinidadTarget = new Map<string, Set<string>>();
  for (const p of coOcurrencia.values()) {
    if (famsCliente.has(p.a)) {
      if (!famsCliente.has(p.b)) {
        const s = afinidadTarget.get(p.b) ?? new Set<string>();
        for (const c of p.clientes) s.add(c);
        afinidadTarget.set(p.b, s);
      }
    } else if (famsCliente.has(p.b)) {
      const s = afinidadTarget.get(p.a) ?? new Set<string>();
      for (const c of p.clientes) s.add(c);
      afinidadTarget.set(p.a, s);
    }
  }

  const candidatas = [...afinidadTarget.entries()]
    .filter(([f]) => Boolean(f))
    .map(([fid, clientes]) => ({
      fid,
      afinidad: (compradoresFamilia.get(fid) ?? 0) > 0
        ? (clientes.size / (compradoresFamilia.get(fid) ?? 1)) * 100
        : 0,
    }))
    .sort((a, b) => b.afinidad - a.afinidad)
    .slice(0, 5);

  const articulosPorFamilia = new Map<string, Map<string, number>>();
  {
    const lineasAll = await enLotes<{ factura_id: string; articulo_id: string | null; cantidad: number }>(
      (lote, desde) =>
        supabase
          .from('factura_lineas')
          .select('factura_id, articulo_id, cantidad')
          .in('factura_id', lote)
          .range(desde, desde + TAMANO_PAGINA - 1),
      idsAnio,
    );
    for (const l of lineasAll) {
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
      familia: cand.fid,
      afinidad: cand.afinidad,
      articulos: topArticulos,
    });
  }
  return recomendaciones;
}