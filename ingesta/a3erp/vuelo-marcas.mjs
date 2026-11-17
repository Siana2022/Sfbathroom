/**
 * Asigna marca a los artículos según la empresa.
 *
 * Regla acordada: en DOT todo es marca "DOT"; el resto de empresas, "Marca blanca".
 * Se define en `config/marcas-empresa.json`:
 *
 *   { "SF": "Marca blanca", "FUX": "Marca blanca", "DOT": "DOT" }
 *
 * Llama a la RPC `reemplazar_marcas_articulos`, que crea la marca si no existe
 * y actualiza articulos.marca_id (por empresa + código de artículo).
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-marcas.mjs
 *   node --env-file=.env vuelo-marcas.mjs --empresa DOT
 *   node --env-file=.env vuelo-marcas.mjs --dry
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const marcas = JSON.parse(readFileSync(resolve(raiz, 'config/marcas-empresa.json'), 'utf8'));

const entorno = Object.fromEntries(
  ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .map((n) => [n, process.env[n] ?? '']),
);

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? undefined : process.argv[i + 1];
};
const soloEmpresa = arg('--empresa');
const dry = process.argv.includes('--dry');

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
const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

async function main() {
  const pool = await mssql.connect(conn);
  try {
    const empresas = soloEmpresa ? a3.empresas.filter((e) => e.codigo === soloEmpresa) : a3.empresas;
    for (const e of empresas) {
      const marca = String(marcas[e.codigo] ?? '').trim();
      if (!marca) {
        console.log(`${e.codigo}: sin marca definida en config/marcas-empresa.json, se omite.`);
        continue;
      }

      const filas = (
        await pool.request().query(`SELECT LTRIM(RTRIM(CODART)) AS codigo FROM [${e.base}].dbo.ARTICULO`)
      ).recordset.map((f) => ({ codigo: f.codigo, marca }));

      console.log(`${e.codigo}: ${filas.length} artículos → marca "${marca}"`);
      if (dry || filas.length === 0) continue;

      const res = await fetch(`${SUPABASE}/rest/v1/rpc/reemplazar_marcas_articulos`, {
        method: 'POST',
        headers: CABECERAS,
        body: JSON.stringify({ p_codigo_empresa: e.codigo, p_filas: filas }),
      });
      if (!res.ok) {
        console.error(`  ERROR ${res.status}: ${await res.text()}`);
        process.exitCode = 1;
      } else {
        console.log(`  ${JSON.stringify(await res.json())}`);
      }
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
