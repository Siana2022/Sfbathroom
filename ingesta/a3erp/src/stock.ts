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

export type FilaStock = {
  codigo: string;
  nombre: string;
  almacen: string;
  almacenNombre: string;
  lote: string;
  unidades: number;
  costeMedio: number | null;
  fechaCaducidad: string;
  ubicacion: string;
};

export function normalizarStock(rows: any[]): FilaStock[] {
  const salida: FilaStock[] = [];
  for (const r of rows) {
    const codigo = String(r.CODART ?? '').trim();
    if (!codigo) continue;
    const fecha = r.FECCADUC ? new Date(r.FECCADUC) : null;
    salida.push({
      codigo,
      nombre: String(r.NOMBRE ?? '').trim(),
      almacen: String(r.CODALM ?? '').trim(),
      almacenNombre: String(r.NOMALM ?? '').trim(),
      lote: String(r.LOTE ?? '').trim(),
      unidades: Number(r.UNIDADESSTOCK ?? 0),
      costeMedio: r.PRCMEDIO == null ? null : Number(r.PRCMEDIO),
      fechaCaducidad: fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString().slice(0, 10) : '',
      ubicacion: String(r.UBICACION ?? '').trim(),
    });
  }
  return salida;
}

export async function cargarStock(opts: { empresaCodigo: string; filas: FilaStock[] }) {
  const aplicadas = await supabaseRpc<number>('reemplazar_stock_almacen', {
    _empresa: opts.empresaCodigo,
    _filas: opts.filas,
  });
  return { ok: true, count: opts.filas.length, aplicadas };
}
