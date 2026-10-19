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

export type GastoLogistica = {
  empresaCodigo: string;
  fecha: string;
  numeroErp: string;
  proveedorCodigo: string;
  proveedorNombre: string;
  categoria: 'fletes' | 'aduanas' | 'transporte_interior';
  baseImponible: number;
  total: number;
};

export function clasificarCategoriaLogistica(nombreProveedor: string): 'fletes' | 'aduanas' | 'transporte_interior' {
  const n = (nombreProveedor ?? '').toUpperCase();
  if (n.includes('AEAT') || n.includes('DUA') || n.includes('ADUAN')) return 'aduanas';
  if (n.includes('CONSIGNACIONES') || n.includes('DISBROQUER') || n.includes('DSV') || n.includes('MARITIM') || n.includes('FLET')) return 'fletes';
  return 'transporte_interior';
}

export function normalizarGastosTransporte(rows: any[], empresaCodigo: string): GastoLogistica[] {
  const gastos: GastoLogistica[] = [];
  for (const r of rows) {
    const fecha = r.FECHA ? new Date(r.FECHA).toISOString().slice(0, 10) : null;
    const numeroErp = String(r.NUMDOC ?? r.IDFACC ?? '').trim();
    const proveedorCodigo = String(r.CODPRO ?? '').trim();
    const proveedorNombre = String(r.NOMPRO ?? '').trim();
    if (!fecha || !numeroErp || !proveedorCodigo) continue;

    gastos.push({
      empresaCodigo,
      fecha,
      numeroErp,
      proveedorCodigo,
      proveedorNombre,
      categoria: clasificarCategoriaLogistica(proveedorNombre),
      baseImponible: Number(r.BASEMONEDA ?? 0),
      total: Number(r.TOTMONEDA ?? 0),
    });
  }
  return gastos;
}

export async function cargarGastosTransporte(opts: { empresaCodigo: string; gastos: GastoLogistica[] }) {
  await supabaseRpc('aplicar_gastos_logistica', {
    _empresa: opts.empresaCodigo,
    _gastos: opts.gastos,
  });
  return { ok: true, count: opts.gastos.length };
}
