/**
 * Diagnóstico (solo lectura): estructura de las tablas con notas de contacto y de
 * cobros, para poder mapearlas sin adivinar.
 *
 * Muestra columnas y unas filas de:
 *   - ClientesContactos   (notas por contacto)
 *   - EfectosClientes     (notas de cobros)
 *
 * Uso: node --env-file=.env diag-notas-detalle.mjs
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

const TABLAS = ['ClientesContactos', 'EfectosClientes'];

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
    console.log(`\n================ ${emp.codigo} (${emp.base}) ================`);
    for (const tabla of TABLAS) {
      const columnas = (
        await pool
          .request()
          .query(`SELECT COLUMN_NAME AS col, DATA_TYPE AS tipo, IS_NULLABLE AS nul
                  FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_NAME = '${tabla}' ORDER BY ORDINAL_POSITION`)
      ).recordset;
      console.log(`\n--- ${tabla} (${columnas.length} columnas) ---`);
      console.log(columnas.map((c) => `${c.col}:${c.tipo}${c.nul === 'YES' ? '?' : ''}`).join(', '));

      if (columnas.length === 0) continue;

      const total = (await pool.request().query(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${tabla}]`)).recordset[0]?.n;
      const conObs = columnas.some((c) => /OBSERV/i.test(c.col))
        ? (
            await pool
              .request()
              .query(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${tabla}]
                      WHERE LTRIM(RTRIM(CAST([OBSERVACIONES] AS nvarchar(max)))) <> ''`)
          ).recordset[0]?.n
        : 'n/a';
      console.log(`filas: ${total} · con observaciones: ${conObs}`);

      const muestra = (await pool.request().query(`SELECT TOP 3 * FROM ${base}.dbo.[${tabla}]`)).recordset;
      for (const fila of muestra) {
        for (const [k, v] of Object.entries(fila)) {
          const texto = v === null ? 'NULL' : String(v).replace(/\s+/g, ' ').slice(0, 90);
          console.log(`   ${k} = ${texto}`);
        }
        console.log('   ---');
      }
    }
  }
} finally {
  await pool.close();
}

console.log('\nListo. Solo lectura.');
