/**
 * Diagnóstico: estructura de FORMAPAGCLI y valores de FORPAG/DOCPAG en clientes.
 * Uso: node --env-file=.env diag-formapago.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const e = Object.fromEntries(['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT'].map((k) => [k, process.env[k] ?? '']));
const pool = await mssql.connect({
  server: e.MSSQL_HOST,
  port: Number(e.MSSQL_PORT || '1433'),
  user: e.MSSQL_USER,
  password: e.MSSQL_PASSWORD,
  options: { encrypt: e.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});
try {
  for (const emp of a3.empresas) {
    const base = `[${emp.base}]`;
    console.log(`\n===== ${emp.codigo} =====`);
    const cols = (await pool.request().query(`SELECT name FROM ${base}.sys.columns WHERE object_id = OBJECT_ID('${base}.dbo.FORMAPAGCLI')`)).recordset;
    console.log('FORMAPAGCLI columnas: ' + cols.map((c) => c.name).join(', '));
    const muestra = (await pool.request().query(`SELECT TOP 5 * FROM ${base}.dbo.FORMAPAGCLI`)).recordset;
    console.table(muestra);
    const forp = (await pool.request().query(`SELECT TOP 10 FORPAG, COUNT(*) AS n FROM ${base}.dbo.[__CLIENTES] GROUP BY FORPAG ORDER BY n DESC`)).recordset;
    console.log('FORPAG más frecuentes:'); console.table(forp);
    const docp = (await pool.request().query(`SELECT TOP 10 DOCPAG, COUNT(*) AS n FROM ${base}.dbo.[__CLIENTES] GROUP BY DOCPAG ORDER BY n DESC`)).recordset;
    console.log('DOCPAG más frecuentes:'); console.table(docp);
  }
} finally {
  await pool.close();
}
