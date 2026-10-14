import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));

function arg(nombre, argv = process.argv.slice(2)) {
  const i = argv.indexOf(nombre);
  return i === -1 ? undefined : argv[i + 1];
}

const desde = arg('--desde') || `${new Date().getFullYear()}-01-01`;
const hasta = arg('--hasta') || new Date().toISOString().slice(0, 10);
const empresaSolo = arg('--empresa');

const nombres = ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'MSSQL_DATABASE'];
const entorno = Object.fromEntries(nombres.map((k) => [k, process.env[k] ?? '']));

const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  database: entorno.MSSQL_DATABASE,
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

// MAPAS de referencia: "--app SF 33743,DOT 13158,FUX 30318" y "--ref SF 33816,DOT 14648,FUX 30712"
function kv(s) {
  const m = new Map();
  if (!s) return m;
  for (const p of s.split(',')) {
    const [k, v] = p.trim().split(/\s+/);
    if (k && v !== undefined) m.set(k, Number(v));
  }
  return m;
}
const appU = kv(arg('--app'));
const refU = kv(arg('--ref'));

const filtro = `WHERE c.FECHA >= CONVERT(datetime, '${desde}', 120) AND c.FECHA <= CONVERT(datetime, '${hasta}', 120)`;
const n = (x) => Number(x) || 0;
const empresas = empresaSolo ? a3.empresas.filter((e) => e.codigo === empresaSolo) : a3.empresas;

async function main() {
  const pool = await mssql.connect(conn);
  try {
    for (const e of empresas) {
      const base = e.base;
      const codigo = e.codigo;
      console.log(`\n=== ${codigo} · base=${base} · ${desde}..${hasta} ===`);

      const porComp = await pool.request().query(
        `SELECT l.ESCOMPONENTE AS K, COUNT(*) AS LINEAS, SUM(l.UNIDADES) AS U
         FROM [${base}].dbo.CABEFACV c JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV
         ${filtro} GROUP BY l.ESCOMPONENTE ORDER BY l.ESCOMPONENTE`,
      );
      console.log('por ESCOMPONENTE:');
      for (const r of porComp.recordset) {
        console.log(`  ${String(r.K).padEnd(4)} lineas=${String(r.LINEAS).padStart(6)} unidades=${n(r.U).toFixed(2).padStart(14)}`);
      }

      const porTipo = await pool.request().query(
        `SELECT c.TIPODOC AS T, l.ESCOMPONENTE AS K, COUNT(*) AS LINEAS, SUM(l.UNIDADES) AS U
         FROM [${base}].dbo.CABEFACV c JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV
         ${filtro} GROUP BY c.TIPODOC, l.ESCOMPONENTE ORDER BY c.TIPODOC, l.ESCOMPONENTE`,
      );
      console.log('por TIPODOC × ESCOMPONENTE:');
      for (const r of porTipo.recordset) {
        console.log(`  ${String(r.T).padEnd(9)} ${String(r.K).padEnd(4)} lineas=${String(r.LINEAS).padStart(6)} unidades=${n(r.U).toFixed(2).padStart(14)}`);
      }

      const un = async (extra) => n((await pool.request().query(
        `SELECT SUM(l.UNIDADES) AS U
         FROM [${base}].dbo.CABEFACV c JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV
         ${filtro} AND ${extra}`,
      )).recordset[0]?.U);

      // Hipótesis 1: normalizar descarta líneas con CODART vacío o PRECIO nulo (esas unidades se pierden)
      const dropHip = await un(`l.ESCOMPONENTE = 'F' AND (l.CODART IS NULL OR LTRIM(RTRIM(l.CODART)) = '' OR l.PRECIO IS NULL)`);

      const app = appU.get(codigo);
      const ref = refU.get(codigo);
      const fila = (label, v) => {
        const da = app === undefined ? '' : `  app=${app} (Δ${(v - app).toFixed(2)})`;
        const dr = ref === undefined ? '' : `  a3erp=${ref} (Δ${(v - ref).toFixed(2)})`;
        console.log(`  ${label.padEnd(40)} unidades=${v.toFixed(2).padStart(14)}${da}${dr}`);
      };

      console.log('candidatos de "unidades" (SUM(UNIDADES)):');
      fila('M1 Cargo + F (lo que lee la ingesta)', await un(`l.ESCOMPONENTE = 'F' AND c.TIPODOC = 'Cargo'`));
      fila('M2 Cargo + todos los ESCOMPONENTE', await un(`c.TIPODOC = 'Cargo'`));
      fila('M3 todos TIPODOC + F (neto de abonos)', await un(`l.ESCOMPONENTE = 'F'`));
      fila('M4 todos TIPODOC + todos ESCOMP (neto)', await un(`1 = 1`));
      fila('M5 Cargo+F que normalizar DESCARTARÍA', dropHip);
      console.log('(si M1 − app ≈ M5 y M1 ≈ a3erp → el bug son las líneas que descarta normalizar.ts)');
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(`[diag-unidades] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
