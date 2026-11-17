/**
 * Diagnóstico: cobros y vencimientos en A3ERP (para DSO y aging reales).
 * Solo lectura.
 *
 * Busca tablas/columnas de recibos, cobros, pagos y vencimientos, y muestra
 * recuentos y una muestra para diseñar el cargador.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-cobros.mjs
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

      const tablas = await q(`SELECT name FROM ${base}.sys.tables
                              WHERE name LIKE '%RECIB%' OR name LIKE '%COBR%' OR name LIKE '%PAGO%'
                                 OR name LIKE '%VENCIM%' OR name LIKE '%REMESA%' OR name LIKE '%CARTERA%'
                              ORDER BY name`);
      console.log('Tablas candidatas: ' + ((tablas ?? []).map((t) => t.name).join(', ') || '(ninguna)'));

      for (const t of tablas ?? []) {
        const fila = await q(`SELECT TOP 1 * FROM ${base}.dbo.[${t.name}]`);
        if (!fila || fila.length === 0 || fila[0].error) continue;
        const claves = Object.keys(fila[0]).filter((k) =>
          /CODCLI|NOMCLI|IMPORTE|FECHA|VENCIM|COBRO|PAGO|DOC|RECIB|ESTADO|BANCO|CARTERA/i.test(k),
        );
        const total = await q(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${t.name}]`);
        console.log(`\n${t.name} · filas: ${total?.[0]?.n ?? '?'}`);
        console.log('  ' + claves.join(', '));
      }

      const cols = await q(`SELECT t.name AS tabla, c.name AS columna
                            FROM ${base}.sys.tables t JOIN ${base}.sys.columns c ON c.object_id = t.object_id
                            WHERE c.name LIKE '%VENCIM%' OR c.name LIKE '%COBRAD%' OR c.name LIKE '%IMPORTECOBR%'
                            ORDER BY t.name, c.name`);
      console.log('\nColumnas con VENCIM/COBRAD:');
      console.table(cols);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
