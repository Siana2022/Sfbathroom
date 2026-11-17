/**
 * Diagnóstico: fabricantes de artículo en A3ERP (candidatos a "marca").
 * Solo lectura.
 *
 * - Reparto de ARTICULO.CODFAB (fabricante) por número de artículos.
 * - Contenido de la tabla de fabricantes, si existe (FABRICANTES / FABRIC%).
 * - Reparto de ARTICULO.CODPRO (proveedor) por número de artículos.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-fabricantes.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const nombres = ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT'];
const entorno = Object.fromEntries(nombres.map((k) => [k, process.env[k] ?? '']));
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

      const fab = await q(`SELECT TOP 40 CODFAB AS fabricante, COUNT(*) AS articulos
                           FROM ${base}.dbo.ARTICULO
                           GROUP BY CODFAB ORDER BY COUNT(*) DESC`);
      console.log('\nARTICULO.CODFAB (fabricante):');
      console.table(fab);

      const tablas = await q(`SELECT name FROM ${base}.sys.tables
                              WHERE name LIKE 'FABRIC%' OR name LIKE '%FABRICANTE%' ORDER BY name`);
      console.log('Tablas de fabricantes: ' + ((tablas ?? []).map((t) => t.name).join(', ') || '(ninguna)'));
      for (const t of tablas ?? []) {
        const filas = await q(`SELECT TOP 50 * FROM ${base}.dbo.[${t.name}]`);
        console.log(`\n${t.name} (primeras 50):`);
        console.table(filas);
      }

      const prov = await q(`SELECT TOP 30 CODPRO AS proveedor, COUNT(*) AS articulos
                            FROM ${base}.dbo.ARTICULO
                            GROUP BY CODPRO ORDER BY COUNT(*) DESC`);
      console.log('\nARTICULO.CODPRO (proveedor):');
      console.table(prov);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
