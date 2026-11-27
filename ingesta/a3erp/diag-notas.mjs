/**
 * Diagnóstico (solo lectura): ¿tiene A3ERP notas u observaciones de cliente?
 *
 * Busca, en las tres bases:
 *   1. Tablas cuyo nombre huela a notas (NOTA, OBSERV, COMENT, ANOTA, MEMO).
 *   2. Columnas con esos nombres en las tablas de clientes.
 *   3. Una muestra de los valores no vacíos de cada columna candidata.
 *
 * No escribe nada. Uso:
 *   node --env-file=.env diag-notas.mjs
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

const PATRONES_TABLA = ['NOTA', 'OBSERV', 'COMENT', 'ANOTA', 'MEMO', 'GESTION'];
const PATRONES_COLUMNA = ['NOTA', 'OBSERV', 'COMENT', 'ANOTA', 'MEMO'];
const ID_CLIENTE = ['CODCLI', 'COD_CLIENTE', 'CLIENTE'];

function likeAny(campo, patrones) {
  return patrones.map((p) => `${campo} LIKE '%${p}%'`).join(' OR ');
}

try {
  for (const emp of a3.empresas) {
    const base = `[${emp.base}]`;
    console.log(`\n================ ${emp.codigo} (${emp.base}) ================`);

    // 1. Tablas candidatas
    const tablas = (
      await pool
        .request()
        .query(`SELECT TABLE_NAME AS t FROM ${base}.INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE = 'BASE TABLE' AND (${likeAny('TABLE_NAME', PATRONES_TABLA)})
                ORDER BY TABLE_NAME`)
    ).recordset.map((r) => r.t);
    console.log(tablas.length ? `Tablas que suenan a notas: ${tablas.join(', ')}` : 'Tablas que suenen a notas: ninguna.');

    // 2. Columnas candidatas en tablas de clientes
    const columnas = (
      await pool
        .request()
        .query(`SELECT TABLE_NAME AS tabla, COLUMN_NAME AS col, DATA_TYPE AS tipo
                FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                WHERE (${likeAny('TABLE_NAME', ['CLIENT'])} OR TABLE_NAME = '__ORGANIZACION' OR TABLE_NAME = '__CLIENTES')
                  AND (${likeAny('COLUMN_NAME', PATRONES_COLUMNA)})
                ORDER BY TABLE_NAME, COLUMN_NAME`)
    ).recordset;

    if (columnas.length === 0) {
      console.log('Columnas de notas en tablas de clientes: ninguna.');
    } else {
      console.log('Columnas de notas en tablas de clientes:');
      console.table(columnas);
    }

    // 3. Muestras
    for (const c of columnas) {
      const idCol = (await pool
        .request()
        .query(`SELECT TOP 1 COLUMN_NAME AS c FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '${c.tabla}' AND COLUMN_NAME IN ('${ID_CLIENTE.join("','")}')`)
      ).recordset[0]?.c;

      const sel = idCol ? `${idCol} AS clienteId, ` : '';
      const filtro = `CAST([${c.col}] AS nvarchar(max)) IS NOT NULL AND LTRIM(RTRIM(CAST([${c.col}] AS nvarchar(max)))) <> ''`;
      const muestra = (
        await pool
          .request()
          .query(`SELECT TOP 5 ${sel}LEFT(CAST([${c.col}] AS nvarchar(max)), 160) AS valor
                  FROM ${base}.dbo.[${c.tabla}]
                  WHERE ${filtro}`)
      ).recordset;
      console.log(`\n  ${c.tabla}.${c.col} — ${muestra.length} valores de muestra:`);
      if (muestra.length) console.table(muestra);
    }
  }
} finally {
  await pool.close();
}

console.log('\nListo. Solo lectura, no se ha modificado nada.');
