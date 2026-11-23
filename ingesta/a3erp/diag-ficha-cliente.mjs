/**
 * Diagnóstico: datos de ficha de cliente y líneas de pedido en A3ERP.
 * Solo lectura.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-ficha-cliente.mjs
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

      const tablas = await q(`SELECT name FROM ${base}.sys.tables WHERE name LIKE 'CLIENT%' OR name LIKE '%CLIEN%' ORDER BY name`);
      console.log('Tablas de clientes: ' + ((tablas ?? []).map((t) => t.name).join(', ') || '(ninguna)'));

      const tabla = (tablas ?? []).find((t) => /^CLIENTES?$/i.test(t.name)) ?? (tablas ?? [])[0];
      if (tabla) {
        const cols = await q(`SELECT c.name AS columna FROM ${base}.sys.columns c
                              WHERE c.object_id = OBJECT_ID('${base}.dbo.${tabla.name}') ORDER BY c.column_id`);
        const interes = (cols ?? [])
          .map((c) => c.columna)
          .filter((n) => /PAG|TARIFA|DTO|DESCUENTO|PLAZO|VENCIM|FORMA|BANCO|RIESGO|CREDITO/i.test(n));
        console.log(`\n${tabla.name} · columnas de interés: ` + interes.join(', '));
      }

      for (const tablaLineas of ['LINEPEDV', 'LINEPEDI', 'LINEALBA']) {
        const lineas = await q(`SELECT TOP 5 * FROM ${base}.dbo.[${tablaLineas}]`);
        console.log(`\n${tablaLineas} (muestra):`);
        console.table(lineas);
      }

      const tarifas = await q(`SELECT TOP 10 * FROM ${base}.dbo.TARIFAS`);
      console.log('\nTARIFAS (muestra):');
      console.table(tarifas);

      const prcesp = await q(`SELECT TOP 5 * FROM ${base}.dbo.PRCESP`);
      console.log('\nPRCESP (precios especiales por cliente, muestra):');
      console.table(prcesp);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
