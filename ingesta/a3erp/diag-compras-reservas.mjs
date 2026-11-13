/**
 * Diagnóstico: compras (coste por lote FIFO) y reservas / stock en mar.
 *
 * Solo lectura. Lista en A3ERP las tablas y columnas relevantes, cuenta filas y
 * saca muestras, para poder diseñar los cargadores sin adivinar:
 *   - facturas/albaranes de compra y su campo CAMBIO + lote
 *   - reservas por artículo y cliente
 *   - pedidos de compra pendientes (stock en mar)
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-compras-reservas.mjs
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

const norm = (v) => String(v ?? '').trim();

async function main() {
  const pool = await mssql.connect(conn);
  const consulta = async (sql) => {
    try {
      return (await pool.request().query(sql)).recordset;
    } catch (err) {
      return null;
    }
  };

  try {
    for (const e of a3.empresas) {
      const base = `[${e.base}]`;
      console.log(`\n================ ${e.codigo} · ${e.base} ================`);

      // 1. Tablas candidatas
      const tablas = await consulta(
        `SELECT name FROM ${base}.sys.tables
         WHERE name LIKE '%COMPRA%' OR name LIKE '%FACC%' OR name LIKE '%ALBC%'
            OR name LIKE '%RESERV%' OR name LIKE '%TRANSITO%' OR name LIKE '%PEDC%'
            OR name LIKE '%PEDI%' OR name LIKE '%LOTE%'
         ORDER BY name`,
      );
      console.log(`Tablas candidatas: ${(tablas ?? []).map((t) => t.name).join(', ') || '(ninguna)'}`);

      // 2. Columnas de las tablas que nos interesan
      for (const tabla of ['CABEFACC', 'LINEFACC', 'CABEALBC', 'LINEALBA', 'T_RESERVAS', 'CABEPEDC', 'LINEAPEDI']) {
        const cols = await consulta(
          `SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_NAME = '${tabla}' ORDER BY ORDINAL_POSITION`,
        );
        if (!cols || cols.length === 0) continue;
        const nombres = cols.map((c) => c.col);
        const clave = nombres.filter((c) =>
          /CAMBIO|LOTE|ARTIC|UNIDAD|PRECIO|COSTE|CODCLI|NOMCLI|PEDV|FECHA|NUMDOC|SERIE|PROVE|IDALB|IDFAC|CANTIDAD/i.test(c),
        );
        console.log(`\n${tabla} (${nombres.length} columnas)`);
        console.log(`  clave: ${clave.join(', ')}`);
      }

      // 3. Muestras
      for (const tabla of ['CABEFACC', 'T_RESERVAS']) {
        const cols = await consulta(
          `SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_NAME = '${tabla}' ORDER BY ORDINAL_POSITION`,
        );
        if (!cols || cols.length === 0) continue;
        const nombres = cols.map((c) => c.col);
        const seleccion = nombres
          .filter((c) => /FECHA|NUMDOC|SERIE|CAMBIO|PROVE|CODCLI|NOMCLI|IDPEDV|ARTIC|UNIDAD|PRECIO|CANTIDAD|LOTE/i.test(c))
          .slice(0, 12)
          .join(', ');
        if (!seleccion) continue;
        const total = await consulta(`SELECT COUNT(*) AS n FROM ${base}.dbo.${tabla}`);
        console.log(`\n${tabla} · filas: ${total?.[0]?.n ?? '?'} · muestra (${seleccion}):`);
        const filas = await consulta(
          `SELECT TOP 5 ${seleccion} FROM ${base}.dbo.${tabla}
           ${nombres.includes('FECHA') ? 'ORDER BY FECHA DESC' : ''}`,
        );
        console.table(filas ?? []);
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
