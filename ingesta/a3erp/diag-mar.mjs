/**
 * Diagnóstico del stock en mar: cómo se sabe qué queda pendiente de recibir
 * en un pedido de compra. Solo lectura.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-mar.mjs
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

      console.table(
        await q(`SELECT COUNT(*) AS lineas,
                        SUM(CASE WHEN IDPEDC IS NOT NULL THEN 1 ELSE 0 END) AS de_compra,
                        SUM(CASE WHEN IDPEDC IS NOT NULL THEN UNIDADES ELSE 0 END) AS unidades_compra,
                        SUM(CASE WHEN IDPEDC IS NOT NULL THEN ISNULL(UNIDADESSTOCK,0) ELSE 0 END) AS unidades_stock
                 FROM ${base}.dbo.LINEPEDI`),
      );

      console.log('Pedidos de compra por SITUACION:');
      console.table(await q(`SELECT SITUACION, COUNT(*) AS pedidos FROM ${base}.dbo.CABEPEDC GROUP BY SITUACION ORDER BY pedidos DESC`));

      console.log('Muestra de líneas de compra con su cabecera:');
      console.table(
        await q(`SELECT TOP 10
                        LTRIM(RTRIM(l.CODART)) AS ARTICULO,
                        l.UNIDADES, l.UNIDADESSTOCK,
                        LTRIM(RTRIM(c.SERIE)) AS SERIE,
                        c.NUMDOC, c.SITUACION,
                        CONVERT(varchar(10), c.FECHA, 120) AS FECHA
                 FROM ${base}.dbo.LINEPEDI l
                 JOIN ${base}.dbo.CABEPEDC c ON c.IDPEDC = l.IDPEDC
                 ORDER BY c.FECHA DESC`),
      );


      console.log('Pendiente por año del pedido (pedidos no anulados):');
      console.table(
        await q(`SELECT YEAR(c.FECHA) AS anio,
                        SUM(CASE WHEN l.UNIDADES - ISNULL(r.RECIBIDAS, 0) > 0
                                 THEN l.UNIDADES - ISNULL(r.RECIBIDAS, 0) ELSE 0 END) AS pendiente,
                        COUNT(DISTINCT c.IDPEDC) AS pedidos
                 FROM ${base}.dbo.CABEPEDC c
                 JOIN ${base}.dbo.LINEPEDI l ON l.IDPEDC = c.IDPEDC
                 LEFT JOIN (
                   SELECT IDPEDC, LTRIM(RTRIM(CODART)) AS CODART, SUM(UNIDADES) AS RECIBIDAS
                   FROM ${base}.dbo.LINEALBA
                   WHERE IDPEDC IS NOT NULL AND IDALBC IS NOT NULL
                   GROUP BY IDPEDC, LTRIM(RTRIM(CODART))
                 ) r ON r.IDPEDC = l.IDPEDC AND r.CODART = LTRIM(RTRIM(l.CODART))
                 WHERE c.SITUACION <> 'A'
                 GROUP BY YEAR(c.FECHA)
                 ORDER BY anio DESC`),
      );

      console.log('Top 10 artículos pendientes con la fecha del pedido más antiguo:');
      console.table(
        await q(`SELECT TOP 10 LTRIM(RTRIM(l.CODART)) AS ARTICULO,
                        SUM(CASE WHEN l.UNIDADES - ISNULL(r.RECIBIDAS, 0) > 0
                                 THEN l.UNIDADES - ISNULL(r.RECIBIDAS, 0) ELSE 0 END) AS pendiente,
                        MIN(CONVERT(varchar(10), c.FECHA, 120)) AS pedido_mas_antiguo,
                        MAX(CONVERT(varchar(10), c.FECHA, 120)) AS pedido_mas_reciente
                 FROM ${base}.dbo.CABEPEDC c
                 JOIN ${base}.dbo.LINEPEDI l ON l.IDPEDC = c.IDPEDC
                 LEFT JOIN (
                   SELECT IDPEDC, LTRIM(RTRIM(CODART)) AS CODART, SUM(UNIDADES) AS RECIBIDAS
                   FROM ${base}.dbo.LINEALBA
                   WHERE IDPEDC IS NOT NULL AND IDALBC IS NOT NULL
                   GROUP BY IDPEDC, LTRIM(RTRIM(CODART))
                 ) r ON r.IDPEDC = l.IDPEDC AND r.CODART = LTRIM(RTRIM(l.CODART))
                 WHERE c.SITUACION <> 'A'
                 GROUP BY LTRIM(RTRIM(l.CODART))
                 HAVING SUM(CASE WHEN l.UNIDADES - ISNULL(r.RECIBIDAS, 0) > 0
                                 THEN l.UNIDADES - ISNULL(r.RECIBIDAS, 0) ELSE 0 END) > 0
                 ORDER BY pendiente DESC`),
      );

      const cols = await q(`SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_NAME = 'CABEPEDC' AND (COLUMN_NAME LIKE '%RECEP%' OR COLUMN_NAME LIKE '%SITUAC%'
                               OR COLUMN_NAME LIKE '%PEND%' OR COLUMN_NAME LIKE '%FECHAENTREGA%' OR COLUMN_NAME LIKE '%ENTREGA%')
                            ORDER BY ORDINAL_POSITION`);
      console.log('Columnas de CABEPEDC relacionadas con recepción/estado:');
      console.log('  ' + (cols ?? []).map((c) => c.col).join(', '));
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
