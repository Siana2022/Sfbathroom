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

export type MaestroCliente = {
  empresaCodigo: string;
  codigo: string;
  nombre: string;
  nombreFiscal?: string | null;
  direccion1?: string | null;
  direccion2?: string | null;
  poblacion?: string | null;
  municipio?: string | null;
  provincia?: string | null;
  codProvincia?: string | null;
  codPais?: string | null;
  pais?: string | null;
  telefono?: string | null;
  fax?: string | null;
  email?: string | null;
  comercialCodigo?: string | null;
  comercialNombre?: string | null;
};

export function normalizarClientes(rows: any[], empresaCodigo: string): MaestroCliente[] {
  const clientes: MaestroCliente[] = [];
  for (const r of rows) {
    const codigo = String(r.COD_CLIENTE ?? r.CODCLI ?? '').trim();
    if (!codigo) continue;
    clientes.push({
      empresaCodigo,
      codigo,
      nombre: String(r.NOMBRE_CLIENTE ?? r.NOMBRE ?? '').trim() || codigo,
      nombreFiscal: r.NOMFISCAL ? String(r.NOMFISCAL) : null,
      direccion1: r.DIR1 ? String(r.DIR1) : null,
      direccion2: r.DIR2 ? String(r.DIR2) : null,
      poblacion: r.POBLACION ? String(r.POBLACION) : null,
      municipio: r.MUNICIPIO ? String(r.MUNICIPIO) : null,
      provincia: r.PROVIFISCAL ? String(r.PROVIFISCAL) : r.PROVINCIA ? String(r.PROVINCIA) : null,
      codProvincia: r.CODPROVI ? String(r.CODPROVI) : null,
      codPais: r.CODPAIS ? String(r.CODPAIS) : null,
      pais: r.PAISFISCAL ? String(r.PAISFISCAL) : null,
      telefono: r.TELEFONO ? String(r.TELEFONO) : null,
      fax: r.FAX ? String(r.FAX) : null,
      email: r.E_MAIL ? String(r.E_MAIL) : null,
      comercialCodigo: r.CODREP ? String(r.CODREP) : null,
      comercialNombre: r.NOMBRE_COMERCIAL ? String(r.NOMBRE_COMERCIAL) : null,
    });
  }
  return clientes;
}

export async function cargarClientesMaestros(opts: { empresaCodigo: string; clientes: MaestroCliente[] }) {
  await supabaseRpc('aplicar_clientes_maestros', {
    _empresa: opts.empresaCodigo,
    _clientes: opts.clientes,
  });
  return { ok: true, count: opts.clientes.length };
}

export type MaestroComercial = {
  empresaCodigo: string;
  codigo: string;
  nombre: string;
};

export function normalizarComerciales(rows: any[], empresaCodigo: string): MaestroComercial[] {
  const vistos = new Map<string, MaestroComercial>();
  for (const r of rows) {
    const codigo = String(r.COD_REP ?? r.CODREP ?? '').trim();
    if (!codigo) continue;
    const nombre = String(r.NOMBRE ?? r.NOMREP ?? '').trim() || codigo;
    vistos.set(codigo, { empresaCodigo, codigo, nombre });
  }
  return [...vistos.values()];
}

export async function cargarComercialesMaestros(opts: { empresaCodigo: string; comerciales: MaestroComercial[] }) {
  await supabaseRpc('aplicar_comerciales_maestros', {
    _empresa: opts.empresaCodigo,
    _comerciales: opts.comerciales,
  });
  return { ok: true, count: opts.comerciales.length };
}
