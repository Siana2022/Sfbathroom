/**
 * Diagnóstico: semántica de CARTERA (vencimientos y cobros) en A3ERP.
 * Solo lectura.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-cartera.mjs
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

      const kpis = await q(`SELECT
          COUNT(*) AS filas,
          SUM(CASE WHEN RECIBIDO IS NULL THEN 1 ELSE 0 END) AS sin_recibir,
          SUM(CASE WHEN RECIBIDO IS NOT NULL THEN 1 ELSE 0 END) AS recibidos,
          SUM(IMPORTE) AS importe_total,
          SUM(IMPORTECOB) AS importe_cobrado,
          MIN(FECHAFACTURA) AS primera_factura,
          MAX(FECHAFACTURA) AS ultima_factura
        FROM ${base}.dbo.CARTERA`);
      console.table(kpis);

      const porAnio = await q(`SELECT YEAR(FECHAFACTURA) AS anio, COUNT(*) AS filas,
                                       SUM(IMPORTE) AS importe, SUM(IMPORTECOB) AS cobrado
                                FROM ${base}.dbo.CARTERA
                                WHERE FECHAFACTURA >= '2024-01-01'
                                GROUP BY YEAR(FECHAFACTURA) ORDER BY anio`);
      console.log('Por año de factura:');
      console.table(porAnio);

      const muestra = await q(`SELECT TOP 8 CODCLI, NUMDOC, FECHAFACTURA, FECHACALCULOVTO,
                                      IMPORTE, IMPORTECOB, IMPORTEDEVANT, RECIBIDO, RECIBIR,
                                      ESDUDOSOCOBRO, BANCO
                               FROM ${base}.dbo.CARTERA
                               WHERE FECHAFACTURA >= '2025-01-01'
                               ORDER BY FECHAFACTURA DESC`);
      console.log('Muestra reciente:');
      console.table(muestra);

      const recibir = await q(`SELECT RECIBIR, COUNT(*) AS n FROM ${base}.dbo.CARTERA GROUP BY RECIBIR`);
      console.log('Valores de RECIBIR:');
      console.table(recibir);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
