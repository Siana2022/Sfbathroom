/**
 * Diagnóstico (solo lectura): ¿cómo marca A3ERP los pedidos abiertos?
 *
 * Mira CABEPEDV: valores de SITUACION, pedidos recientes y cuántos hay por año.
 * Sirve para decidir qué significa "pendiente" en este ERP.
 *
 * Uso: node --env-file=.env diag-pedidos-situacion.mjs
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

const pool = await mssql.connect({
  server: e.MSSQL_HOST,
  port: Number(e.MSSQL_PORT || '1433'),
  user: e.MSSQL_USER,
  password: e.MSSQL_PASSWORD,
  options: { encrypt: e.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});

const limpio = (v) => (v === null || v === undefined ? null : String(v).trim());

try {
  for (const emp of a3.empresas) {
    const base = `[${emp.base}]`;
    console.log(`\n================ ${emp.codigo} (${emp.base}) ================`);

    const cols = (
      await pool
        .request()
        .query(`SELECT COLUMN_NAME AS c FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'CABEPEDV' ORDER BY ORDINAL_POSITION`)
    ).recordset.map((r) => r.c);
    console.log(`CABEPEDV columnas: ${cols.join(', ')}`);

    const situ = (
      await pool.request().query(`SELECT SITUACION, COUNT(*) AS n FROM ${base}.dbo.CABEPEDV GROUP BY SITUACION ORDER BY n DESC`)
    ).recordset;
    console.log('SITUACION:');
    console.table(situ);

    const porAnio = (
      await pool
        .request()
        .query(`SELECT YEAR(FECHA) AS anio, COUNT(*) AS n FROM ${base}.dbo.CABEPEDV GROUP BY YEAR(FECHA) ORDER BY anio DESC`)
    ).recordset;
    console.log('Pedidos por año:');
    console.table(porAnio);

    const recientes = (
      await pool
        .request()
        .query(`SELECT TOP 10 NUMDOC, SERIE, FECHA, SITUACION, FECHAPROM
                FROM ${base}.dbo.CABEPEDV ORDER BY FECHA DESC`)
    ).recordset;
    console.log('Últimos 10 pedidos:');
    console.table(recientes);
  }
} finally {
  await pool.close();
}

console.log('\nListo. Solo lectura.');
