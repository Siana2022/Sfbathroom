/**
 * Diagnóstico: ¿dónde está la marca del artículo en A3ERP?
 * Solo lectura.
 *
 * - Lista las tablas de artículos de cada empresa.
 * - Muestra TODAS las columnas de la tabla principal.
 * - Para las columnas que huelen a marca/fabricante/grupo/familia, saca los
 *   valores más frecuentes (para saber si sirven como marca).
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-marca-articulos.mjs
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

const CANDIDATAS = /MARCA|FABRIC|BRAND|GRUPO|FAMILIA|SUBFAM|COLECC|SERIE|LINEA/i;

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

      const tablas = await q(`SELECT name FROM ${base}.sys.tables WHERE name LIKE 'ARTICUL%' OR name LIKE '%ARTICU%' ORDER BY name`);
      console.log('Tablas: ' + ((tablas ?? []).map((t) => t.name).join(', ') || '(ninguna)'));

      const principal = (tablas ?? []).find((t) => /^ARTICULOS?$/i.test(t.name)) ?? (tablas ?? [])[0];
      if (!principal) continue;

      const cols = await q(`SELECT c.name AS columna, t.name AS tipo, c.max_length AS longitud
                            FROM ${base}.sys.columns c
                            JOIN ${base}.sys.types t ON t.user_type_id = c.user_type_id
                            WHERE c.object_id = OBJECT_ID('${base}.dbo.${principal.name}')
                            ORDER BY c.column_id`);
      console.log(`\nColumnas de ${principal.name}:`);
      console.table(cols);

      const sospechosas = (cols ?? []).filter((c) => CANDIDATAS.test(String(c.columna))).map((c) => c.columna);
      for (const col of sospechosas) {
        const filas = await q(`SELECT TOP 15 [${col}] AS valor, COUNT(*) AS n
                               FROM ${base}.dbo.[${principal.name}]
                               GROUP BY [${col}] ORDER BY COUNT(*) DESC`);
        console.log(`\nValores de ${principal.name}.${col}:`);
        console.table(filas);
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
