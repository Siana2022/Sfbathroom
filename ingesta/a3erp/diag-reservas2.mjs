/**
 * Diagnóstico: reservas de stock reales en A3ERP.
 * Solo lectura.
 *
 * Mira T_ARTALM.STOCKRESERVADO (reservado por artículo/almacén) y
 * T_LINUBI.CANTRESERVADAEXPEDIR (reservado para expedir), además de T_CABEEXP.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-reservas2.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const entorno = Object.fromEntries(
  ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT'].map((n) => [n, process.env[n] ?? '']),
);
if (!entorno.MSSQL_HOST) {
  console.error('Falta MSSQL_HOST: ejecuta con el .env de la ingesta.');
  process.exit(1);
}
const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

async function main() {
  const pool = await mssql.connect(conn);
  const q = async (sql) => {
    try {
      return (await pool.request().query(sql)).recordset;
    } catch (e) {
      return [{ error: e.message }];
    }
  };
  try {
    for (const e of a3.empresas) {
      const base = `[${e.base}]`;
      console.log(`\n================ ${e.codigo} · ${e.base} ================`);

      console.log('T_ARTALM · reservado por artículo/almacén:');
      console.table(
        await q(`SELECT COUNT(*) AS filas,
                        SUM(ISNULL(STOCKRESERVADO,0)) AS reservado_total,
                        SUM(CASE WHEN ISNULL(STOCKRESERVADO,0) > 0 THEN 1 ELSE 0 END) AS articulos_con_reserva
                 FROM ${base}.dbo.T_ARTALM`),
      );
      console.table(
        await q(`SELECT TOP 10 LTRIM(RTRIM(CODART)) AS ARTICULO, LTRIM(RTRIM(CODALM)) AS ALMACEN,
                        STOCKRESERVADO, STOCK
                 FROM ${base}.dbo.T_ARTALM
                 WHERE ISNULL(STOCKRESERVADO,0) > 0
                 ORDER BY STOCKRESERVADO DESC`),
      );

      const colsUbi = await q(`SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                               WHERE TABLE_NAME = 'T_LINUBI'
                               AND (COLUMN_NAME LIKE '%RESERV%' OR COLUMN_NAME LIKE '%ARTIC%' OR COLUMN_NAME LIKE '%UBI%'
                                    OR COLUMN_NAME LIKE '%EXP%' OR COLUMN_NAME LIKE '%CANT%')
                               ORDER BY ORDINAL_POSITION`);
      console.log('\nT_LINUBI · columnas: ' + (colsUbi ?? []).map((c) => c.col).join(', '));
      console.table(
        await q(`SELECT COUNT(*) AS filas,
                        SUM(ISNULL(CANTRESERVADAEXPEDIR,0)) AS reservado_expedir
                 FROM ${base}.dbo.T_LINUBI`),
      );

      console.log('T_CABEEXP · TIPORESERVA:');
      console.table(await q(`SELECT TIPORESERVA, COUNT(*) AS filas FROM ${base}.dbo.T_CABEEXP GROUP BY TIPORESERVA`));
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
