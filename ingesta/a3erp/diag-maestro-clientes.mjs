/**
 * Diagnóstico: localizar el maestro de clientes de A3ERP.
 * Solo lectura.
 *
 * Busca cualquier tabla con columna CODCLI y muestra las columnas que huelan a
 * forma de pago, tarifa, descuento, plazo o crédito, además de una muestra.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-maestro-clientes.mjs
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

const INTERESA = /PAG|TARIFA|DTO|DESCUENTO|PLAZO|VENCIM|FORMA|CREDITO|RIESGO|BANCO|COBRO|TRANSPORTE|ENVIO|PORTES/i;

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

      const tablas = await q(`SELECT DISTINCT t.name AS tabla
                              FROM ${base}.sys.tables t
                              JOIN ${base}.sys.columns c ON c.object_id = t.object_id
                              WHERE c.name = 'CODCLI'
                              ORDER BY t.name`);
      console.log('Tablas con CODCLI: ' + ((tablas ?? []).map((t) => t.tabla).join(', ') || '(ninguna)'));

      for (const t of tablas ?? []) {
        const cols = await q(`SELECT c.name AS columna FROM ${base}.sys.columns c
                              WHERE c.object_id = OBJECT_ID('${base}.dbo.${t.tabla}')`);
        const lista = (cols ?? []).map((c) => c.columna);
        if (!lista.includes('NOMBRE') && !lista.some((c) => /^NOM/i.test(c))) continue;

        const interes = lista.filter((c) => INTERESA.test(c));
        if (interes.length === 0) continue;

        const total = await q(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${t.tabla}]`);
        console.log(`\n${t.tabla} · ${total?.[0]?.n ?? '?'} filas`);
        console.log('  columnas de interés: ' + interes.join(', '));

        const muestra = await q(`SELECT TOP 3 CODCLI, ${interes.slice(0, 12).map((c) => `[${c}]`).join(', ')}
                                 FROM ${base}.dbo.[${t.tabla}] WHERE CODCLI IS NOT NULL`);
        console.table(muestra);
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
