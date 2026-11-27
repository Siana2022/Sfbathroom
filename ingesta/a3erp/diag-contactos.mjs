/**
 * Diagnóstico (solo lectura): notas por contacto en `ContactosSeleccionClientes`.
 *
 * Imprime las columnas que importan (cliente, contacto, email, teléfono, cargo y
 * observaciones) y 10 filas con observaciones no vacías, por empresa.
 *
 * Uso: node --env-file=.env diag-contactos.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const e = Object.fromEntries(
  ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT'].map((k) => [k, process.env[k] ?? '']),
);

const TABLA = 'ContactosSeleccionClientes';
const INTERESAN = /CODCLI|CONTACTO|NOMBRE|EMAIL|MAIL|TEL|CARGO|OBSERV|ID/i;

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
    const columnas = (
      await pool
        .request()
        .query(`SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '${TABLA}' ORDER BY ORDINAL_POSITION`)
    ).recordset.map((c) => c.col);

    console.log(`\n================ ${emp.codigo} ================`);
    console.log(`columnas: ${columnas.join(', ') || '(no existe la tabla)'}`);
    if (columnas.length === 0) continue;

    const seleccion = columnas.filter((c) => INTERESAN.test(c)).map((c) => `[${c}]`).join(', ');
    const total = (await pool.request().query(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${TABLA}]`)).recordset[0]?.n;
    const conObs = (
      await pool
        .request()
        .query(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${TABLA}]
                WHERE OBSERVACIONES IS NOT NULL AND LTRIM(RTRIM(CAST(OBSERVACIONES AS nvarchar(max)))) <> ''`)
    ).recordset[0]?.n;
    console.log(`filas: ${total} · con observaciones: ${conObs}`);

    const muestra = (
      await pool
        .request()
        .query(`SELECT TOP 10 ${seleccion} FROM ${base}.dbo.[${TABLA}]
                WHERE OBSERVACIONES IS NOT NULL AND LTRIM(RTRIM(CAST(OBSERVACIONES AS nvarchar(max)))) <> ''`)
    ).recordset;

    for (const fila of muestra) {
      console.log('---');
      for (const [k, v] of Object.entries(fila)) {
        const texto = v === null ? 'NULL' : String(v).replace(/\s+/g, ' ').slice(0, 140);
        console.log(`  ${k} = ${texto}`);
      }
    }
  }
} finally {
  await pool.close();
}

console.log('\nListo. Solo lectura.');
