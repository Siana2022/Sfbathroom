import { cfg } from './config';

function supabaseRpc<T>(nombre: string, body: unknown): Promise<T> {
  const url = `${cfg.supabaseUrl}/rest/v1/rpc/${nombre}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const texto = await r.text();
    if (!r.ok) throw new Error(`${nombre}: ${r.status} ${texto}`);
    if (!texto) return null as T;
    return JSON.parse(texto) as T;
  });
}

export type MaestroArticulo = {
  empresaCodigo: string;
  codigo: string;
  nombre: string;
  precioCoste?: number | null;
  precioBase?: number | null;
  referencia?: string | null;
  codigoBarras?: string | null;
  peso?: number | null;
  volumen?: number | null;
};

export function normalizarArticulos(rows: any[], empresaCodigo: string): MaestroArticulo[] {
  const articulos: MaestroArticulo[] = [];
  for (const r of rows) {
    const codigo = String(r.COD_ARTICULO ?? r.CODART ?? '').trim();
    if (!codigo) continue;
    articulos.push({
      empresaCodigo,
      codigo,
      nombre: String(r.NOMBRE_ARTICULO ?? r.DESCART ?? '').trim() || codigo,
      precioCoste: r.PRCCOSTE != null ? Number(r.PRCCOSTE) : null,
      precioBase: r.PRECIOBASE != null ? Number(r.PRECIOBASE) : null,
      referencia: r.REFART ? String(r.REFART) : null,
      codigoBarras: r.CODBAR ? String(r.CODBAR) : null,
      peso: r.PESO != null ? Number(r.PESO) : null,
      volumen: r.VOLUMEN != null ? Number(r.VOLUMEN) : null,
    });
  }
  return articulos;
}

export async function cargarArticulosMaestros(opts: { empresaCodigo: string; articulos: MaestroArticulo[] }) {
  await supabaseRpc('aplicar_articulos_maestros', {
    _empresa: opts.empresaCodigo,
    _articulos: opts.articulos,
  });
  return { ok: true, count: opts.articulos.length };
}
