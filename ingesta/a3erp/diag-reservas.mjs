/**
 * Diagnóstico: ¿dónde guarda A3ERP las reservas de stock al proveedor?
 * Solo lectura.
 *
 * Busca tablas/columnas con RESERV y examina
 * __LINEEXPERESERVASPROVISIONSUPLIDOS (reservas, provisiones y suplidos).
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-reservas.mjs
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

      console.log('Columnas con RESERV en toda la base:');
      console.table(
        await q(`SELECT t.name AS tabla, c.name AS columna
                 FROM ${base}.sys.tables t JOIN ${base}.sys.columns c ON c.object_id = t.object_id
                 WHERE c.name LIKE '%RESERV%' ORDER BY t.name, c.name`),
      );

      const tabla = '__LINEEXPERESERVASPROVISIONSUPLIDOS';
      const columnas = await q(`SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_NAME = '${tabla}' ORDER BY ORDINAL_POSITION`);
      const nombres = (columnas ?? []).map((c) => c.col);
      console.log(`\n${tabla}: ${nombres.length} columnas`);
      console.log('  ' + nombres.join(', '));

      console.table(await q(`SELECT COUNT(*) AS filas FROM ${base}.dbo.${tabla}`));
      const muestra = nombres.filter((c) => /ARTIC|UNIDAD|CANT|PED|FECHA|RESERV|ALB|PROVE|RESERV|CLI/i.test(c)).slice(0, 14);
      if (muestra.length) {
        console.log('  muestra:');
        console.table(await q(`SELECT TOP 8 ${muestra.join(', ')} FROM ${base}.dbo.${tabla}`));
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
