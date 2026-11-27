/**
 * Carga las notas de cobro de A3ERP (`EfectosClientes.OBSERVACIONES`) en
 * `public.cobros_notas`.
 *
 * Son pocas (unas 4 en FUX y ninguna en SF ni DOT) y van a una tabla que solo ven
 * administración, dirección y financiero: el comercial no debe verlas.
 *
 * Uso (en el PC, con su .env):
 *   node --env-file=.env vuelo-notas-cobro.mjs
 *   node --env-file=.env vuelo-notas-cobro.mjs --empresa FUX
 *
 * Requiere la migración 0097 aplicada.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const entorno = Object.fromEntries(
  ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .map((n) => [n, process.env[n] ?? '']),
);
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};
const soloEmpresa = arg('--empresa');

if (!entorno.MSSQL_HOST || !entorno.SUPABASE_URL || !entorno.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan variables: ejecuta con el .env de la ingesta.');
  process.exit(1);
}

const SUPABASE = entorno.SUPABASE_URL.replace(/\/$/, '');
const CABECERAS = {
  apikey: entorno.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${entorno.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

const limpio = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const isoFecha = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : null);

async function leer(tabla, campos, filtro = '') {
  const res = await fetch(`${SUPABASE}/rest/v1/${tabla}?select=${campos}${filtro}&limit=1000`, { headers: CABECERAS });
  if (!res.ok) throw new Error(`${tabla} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function upsert(filas) {
  if (filas.length === 0) return 0;
  const res = await fetch(`${SUPABASE}/rest/v1/cobros_notas?on_conflict=origen,id_externo&select=id`, {
    method: 'POST',
    headers: { ...CABECERAS, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`cobros_notas ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return (await res.json()).length;
}

const pool = await mssql.connect({
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});

try {
  const empresas = (await leer('empresas', 'id,codigo')).reduce((m, e) => ({ ...m, [e.codigo]: e.id }), {});
  const objetivo = soloEmpresa ? a3.empresas.filter((e) => e.codigo === soloEmpresa) : a3.empresas;

  for (const e of objetivo) {
    const base = `[${e.base}]`;
    const filas = (
      await pool.request().query(`
        SELECT CODCLI, SERIE, NUMDOC, FECHA, IMPORTE, IDCARTERA, OBSERVACIONES
        FROM ${base}.dbo.EfectosClientes
        WHERE OBSERVACIONES IS NOT NULL AND LTRIM(RTRIM(CAST(OBSERVACIONES AS nvarchar(max)))) <> ''
      `)
    ).recordset;

    if (filas.length === 0) {
      console.log(`${e.codigo}: sin notas de cobro`);
      continue;
    }

    const clientes = await leer('clientes', 'id,codigo_erp', `&empresa_id=eq.${empresas[e.codigo]}`);
    const porCodigo = new Map(clientes.filter((c) => c.codigo_erp).map((c) => [String(c.codigo_erp).trim(), c.id]));

    const registros = filas.map((f) => ({
      empresa_id: empresas[e.codigo],
      cliente_id: porCodigo.get(String(f.CODCLI ?? '').trim()) ?? null,
      fecha: isoFecha(f.FECHA),
      documento: limpio(`${f.SERIE ?? ''}${f.NUMDOC ?? ''}`),
      importe: num(f.IMPORTE),
      texto: limpio(f.OBSERVACIONES),
      origen: 'a3erp',
      id_externo: `${e.codigo}:${f.IDCARTERA}`,
    }));

    const escritas = await upsert(registros);
    const sinCliente = registros.filter((r) => !r.cliente_id).length;
    console.log(`${e.codigo}: ${filas.length} notas · ${escritas} escritas · ${sinCliente} sin cliente`);
  }
} finally {
  await pool.close();
}
