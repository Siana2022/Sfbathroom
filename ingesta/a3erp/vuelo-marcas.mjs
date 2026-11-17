/**
 * Asigna marca a los artículos según su proveedor de A3ERP.
 *
 * A3ERP no guarda marca ni fabricante en ARTICULO (CODFAB vacío), así que la
 * marca se deduce de `config/marcas-proveedor.json`:
 *
 *   { "SF": { "714": "Starbath Plus", "753": "Marca blanca" }, ... }
 *
 * Llama a la RPC `reemplazar_marcas_articulos`, que crea la marca si no existe
 * y actualiza articulos.marca_id (por empresa + código de artículo).
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-marcas.mjs
 *   node --env-file=.env vuelo-marcas.mjs --empresa SF
 *   node --env-file=.env vuelo-marcas.mjs --dry
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const mapa = JSON.parse(readFileSync(resolve(raiz, 'config/marcas-proveedor.json'), 'utf8'));

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

const limpio = (v) => String(v ?? '').trim();

async function main() {
  const pool = await mssql.connect(conn);
  try {
    const empresas = soloEmpresa ? a3.empresas.filter((e) => e.codigo === soloEmpresa) : a3.empresas;
    for (const e of empresas) {
      const equivalencias = Object.fromEntries(
        Object.entries(mapa[e.codigo] ?? {})
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => [limpio(k), String(v)]),
      );
      const claves = Object.keys(equivalencias);
      if (claves.length === 0) {
        console.log(`${e.codigo}: sin equivalencias en config/marcas-proveedor.json, se omite.`);
        continue;
      }

      const filas = (
        await pool.request().query(
          `SELECT LTRIM(RTRIM(CODART)) AS codigo, LTRIM(RTRIM(CODPRO)) AS proveedor FROM [${e.base}].dbo.ARTICULO`,
        )
      ).recordset;

      const asignables = [];
      const sinMapeo = new Set();
      for (const f of filas) {
        const marca = equivalencias[f.proveedor];
        if (marca) asignables.push({ codigo: f.codigo, marca });
        else if (f.proveedor) sinMapeo.add(f.proveedor);
      }

      console.log(
        `${e.codigo}: ${filas.length} artículos · ${asignables.length} con marca asignable · ` +
          `${sinMapeo.size} proveedores sin mapeo`,
      );
      if (sinMapeo.size > 0) console.log(`  sin mapeo: ${[...sinMapeo].sort().join(', ')}`);
      if (dry || asignables.length === 0) continue;

      const res = await fetch(`${SUPABASE}/rest/v1/rpc/reemplazar_marcas_articulos`, {
        method: 'POST',
        headers: CABECERAS,
        body: JSON.stringify({ p_codigo_empresa: e.codigo, p_filas: asignables }),
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
