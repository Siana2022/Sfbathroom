/**
 * Diagnóstico de pedidos en A3ERP (solo lectura).
 *
 * Responde la pregunta que decide si la página "Pedidos y cartera" está vacía
 * porque no hay cartera o porque la ingesta no trae los pedidos abiertos:
 *   - ¿qué valores tiene SITUACION y cuántos pedidos hay de cada uno?
 *   - ¿existen pedidos que no estén servidos (S) ni anulados (A)?
 *   - ¿la fecha de entrega (FECHAENTREGA) tiene datos y difiere de la de registro?
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   npm run diag:pedidos
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));

const nombres = ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'MSSQL_DATABASE'];
const entorno = Object.fromEntries(nombres.map((n) => [n, process.env[n] ?? '']));

if (!entorno.MSSQL_HOST) {
  console.error('Falta MSSQL_HOST: ejecuta esto con el .env de la ingesta (`npm run diag:pedidos`).');
  process.exit(1);
}

const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  database: entorno.MSSQL_DATABASE || undefined,
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

function pintar(titulo, filas) {
  console.log(`\n${titulo}`);
  if (!filas || filas.length === 0) {
    console.log('  (sin filas)');
    return;
  }
  console.table(filas);
}

async function main() {
  const pool = await mssql.connect(conn);
  try {
    for (const e of a3.empresas) {
      const base = `[${e.base}]`;
      console.log(`\n================ ${e.codigo} · ${e.base} ================`);

      const columnas = (
        await pool
          .request()
          .query(
            `SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_NAME = 'CABEPEDV' ORDER BY ORDINAL_POSITION`,
          )
      ).recordset.map((r) => r.col);

      if (columnas.length === 0) {
        console.log('No existe la tabla CABEPEDV en esta base.');
        continue;
      }
      console.log(`Columnas: ${columnas.join(', ')}`);

      const col = (re) => columnas.find((c) => re.test(c));
      const cSituacion = col(/^SITUACION$/i);
      const cFecha = col(/^FECHA$/i);
      const cEntrega = col(/^FECHAENTREGA$|^FECHENTREGA$|^FECHA_ENTREGA$/i);
      const cNum = col(/^NUMDOC$/i);
      const cSerie = col(/^SERIE$/i);
      const cCli = col(/^CODCLI$/i);
      const cNom = col(/^NOMCLI$/i);

      const orden = cFecha ?? cNum;
      const orderBy = orden ? `ORDER BY ${orden} DESC` : 'ORDER BY (SELECT NULL)';

      if (cFecha) {
        const rango = (
          await pool
            .request()
            .query(
              `SELECT MIN(${cFecha}) AS desde, MAX(${cFecha}) AS hasta, COUNT(*) AS pedidos FROM ${base}.dbo.CABEPEDV`,
            )
        ).recordset[0];
        pintar('Rango de fechas y volumen:', [rango]);
      }

      if (cSituacion) {
        const dist = (
          await pool
            .request()
            .query(
              `SELECT ${cSituacion} AS situacion, COUNT(*) AS pedidos
               FROM ${base}.dbo.CABEPEDV GROUP BY ${cSituacion} ORDER BY pedidos DESC`,
            )
        ).recordset;
        pintar('Pedidos por SITUACION:', dist);

        const detalle = [cNum, cSerie, cFecha, cSituacion, cCli, cNom].filter(Boolean).join(', ');
        const abiertos = (
          await pool
            .request()
            .query(
              `SELECT TOP 20 ${detalle}
               FROM ${base}.dbo.CABEPEDV
               WHERE ${cSituacion} IS NULL OR ${cSituacion} NOT IN ('S', 'A')
               ${orderBy}`,
            )
        ).recordset;
        pintar('Últimos 20 pedidos que NO están servidos ni anulados:', abiertos);
      } else {
        console.log('No encuentro la columna SITUACION en CABEPEDV.');
      }

      if (cFecha && cEntrega) {
        const ent = (
          await pool
            .request()
            .query(
              `SELECT COUNT(*) AS total,
                      SUM(CASE WHEN ${cEntrega} IS NULL THEN 1 ELSE 0 END) AS sin_fecha_entrega,
                      SUM(CASE WHEN ${cEntrega} IS NOT NULL AND ${cEntrega} <> ${cFecha} THEN 1 ELSE 0 END) AS entrega_distinta
               FROM ${base}.dbo.CABEPEDV`,
            )
        ).recordset[0];
        pintar('Fecha de entrega en el ERP:', [ent]);
      } else {
        console.log('No encuentro columna de fecha de entrega (FECHAENTREGA) en CABEPEDV.');
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
