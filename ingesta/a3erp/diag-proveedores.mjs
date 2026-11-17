/**
 * Diagnóstico: nombres de los proveedores que tienen artículos.
 * Solo lectura.
 *
 * - Localiza la tabla de proveedores y sus columnas.
 * - Para cada código de ARTICULO.CODPRO muestra su nombre y cuántos artículos tiene.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-proveedores.mjs
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

      const tablas = await q(`SELECT name FROM ${base}.sys.tables WHERE name LIKE 'PROVEED%' ORDER BY name`);
      console.log('Tablas: ' + ((tablas ?? []).map((t) => t.name).join(', ') || '(ninguna)'));
      const tabla = (tablas ?? [])[0];
      if (!tabla) continue;

      const cols = await q(`SELECT name AS columna, system_type_id FROM ${base}.sys.columns
                            WHERE object_id = OBJECT_ID('${base}.dbo.${tabla.name}') ORDER BY column_id`);
      console.log(`\nColumnas de ${tabla.name}: ` + cols.map((c) => c.columna).join(', '));

      const filas = await q(`SELECT a.CODPRO AS codigo, COUNT(*) AS articulos,
                                    MAX(p.NOMBRE) AS nombre
                             FROM ${base}.dbo.ARTICULO a
                             LEFT JOIN ${base}.dbo.[${tabla.name}] p ON LTRIM(RTRIM(p.CODPRO)) = LTRIM(RTRIM(a.CODPRO))
                             GROUP BY a.CODPRO
                             ORDER BY COUNT(*) DESC`);
      console.log('\nProveedores de artículos:');
      console.table(filas);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
