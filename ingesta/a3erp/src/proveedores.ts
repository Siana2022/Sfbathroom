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

export type MaestroProveedor = {
  empresaCodigo: string;
  codigo: string;
  nombre: string;
  nombreFiscal?: string | null;
  cif?: string | null;
  direccion1?: string | null;
  direccion2?: string | null;
  poblacion?: string | null;
  provincia?: string | null;
  pais?: string | null;
  telefono?: string | null;
  email?: string | null;
  plazoSuministro?: number | null;
};

export function normalizarProveedores(rows: any[], empresaCodigo: string): MaestroProveedor[] {
  const proveedores: MaestroProveedor[] = [];
  for (const r of rows) {
    const codigo = String(r.COD_PROVEEDOR ?? r.CODPRO ?? '').trim();
    if (!codigo) continue;
    proveedores.push({
      empresaCodigo,
      codigo,
      nombre: String(r.NOMBRE_PROVEEDOR ?? r.NOMBRE ?? '').trim() || codigo,
      nombreFiscal: r.NOMFISCAL ? String(r.NOMFISCAL) : null,
      cif: r.NIF ? String(r.NIF) : null,
      direccion1: r.DIR1 ? String(r.DIR1) : null,
      direccion2: r.DIR2 ? String(r.DIR2) : null,
      poblacion: r.POBLACION ? String(r.POBLACION) : null,
      provincia: r.PROVINCIA ? String(r.PROVINCIA) : null,
      pais: r.PAIS ? String(r.PAIS) : null,
      telefono: r.TELEFONO ? String(r.TELEFONO) : null,
      email: r.E_MAIL ? String(r.E_MAIL) : null,
      plazoSuministro: r.PLAZOSUMINISTRO != null ? Number(r.PLAZOSUMINISTRO) : null,
    });
  }
  return proveedores;
}

export async function cargarProveedoresMaestros(opts: { empresaCodigo: string; proveedores: MaestroProveedor[] }) {
  await supabaseRpc('aplicar_proveedores_maestros', {
    _empresa: opts.empresaCodigo,
    _proveedores: opts.proveedores,
  });
  return { ok: true, count: opts.proveedores.length };
}
