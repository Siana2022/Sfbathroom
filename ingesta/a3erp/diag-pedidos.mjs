/**
 * Diagnóstico de pedidos y albaranes en A3ERP (solo lectura).
 *
 * Objetivo: decidir de dónde sale la "cartera pendiente" de sfbathroom.
 * En CABEPEDV todo está servido (S) o anulado (A), así que la cartera real
 * apunta a los albaranes servidos y todavía no facturados (CABEALBV).
 *
 * Muestra, por empresa:
 *   - CABEPEDV: columnas, volumen, SITUACION y fecha de entrega (FECENTREGA)
 *   - CABEALBV: columnas, volumen, rango e importe
 *   - cuántos albaranes están SIN FACTURAR y una muestra de ellos
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

  const consulta = async (sql) => {
    try {
      return (await pool.request().query(sql)).recordset;
    } catch (err) {
      console.log(`  [no se pudo consultar: ${err.message}]`);
      return null;
    }
  };

  const columnasDe = async (base, tabla) => {
    const filas = await consulta(
      `SELECT COLUMN_NAME AS col FROM ${base}.INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = '${tabla}' ORDER BY ORDINAL_POSITION`,
    );
    return (filas ?? []).map((r) => r.col);
  };

  const buscar = (columnas, ...candidatos) => {
    for (const c of candidatos) {
      const encontrada = columnas.find((x) => x.toUpperCase() === c.toUpperCase());
      if (encontrada) return encontrada;
    }
    return null;
  };

  try {
    for (const e of a3.empresas) {
      const base = `[${e.base}]`;
      console.log(`\n================ ${e.codigo} · ${e.base} ================`);

      // ---------------- Pedidos ----------------
      const colsPed = await columnasDe(base, 'CABEPEDV');
      if (colsPed.length === 0) {
        console.log('No existe CABEPEDV.');
      } else {
        const cFecha = buscar(colsPed, 'FECHA');
        const cEntrega = buscar(colsPed, 'FECENTREGA', 'FECHENTREGA', 'FECHAENTREGA', 'FECHA_ENTREGA');
        const cSituacion = buscar(colsPed, 'SITUACION');
        const cNum = buscar(colsPed, 'NUMDOC');
        const cSerie = buscar(colsPed, 'SERIE');
        const cNom = buscar(colsPed, 'NOMCLI');

        if (cFecha) {
          pintar(
            'Pedidos · rango y volumen',
            await consulta(
              `SELECT MIN(${cFecha}) AS desde, MAX(${cFecha}) AS hasta, COUNT(*) AS pedidos
               FROM ${base}.dbo.CABEPEDV`,
            ),
          );
        }
        if (cSituacion) {
          pintar(
            'Pedidos · por SITUACION',
            await consulta(
              `SELECT ${cSituacion} AS situacion, COUNT(*) AS pedidos
               FROM ${base}.dbo.CABEPEDV GROUP BY ${cSituacion} ORDER BY pedidos DESC`,
            ),
          );
        }
        if (cFecha && cEntrega) {
          pintar(
            `Pedidos · fecha de entrega (${cEntrega})`,
            await consulta(
              `SELECT COUNT(*) AS total,
                      SUM(CASE WHEN ${cEntrega} IS NULL THEN 1 ELSE 0 END) AS sin_fecha,
                      SUM(CASE WHEN ${cEntrega} IS NOT NULL AND ${cEntrega} <> ${cFecha} THEN 1 ELSE 0 END) AS distinta_de_fecha,
                      SUM(CASE WHEN ${cEntrega} > CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS entrega_futura
               FROM ${base}.dbo.CABEPEDV`,
            ),
          );
        }
      }

      // ---------------- Albaranes ----------------
      const colsAlb = await columnasDe(base, 'CABEALBV');
      if (colsAlb.length === 0) {
        console.log('No existe CABEALBV (albaranes de venta).');
        continue;
      }

      console.log(`Albaranes · columnas clave: ${colsAlb.join(', ')}`);

      const aNum = buscar(colsAlb, 'NUMDOC');
      const aSerie = buscar(colsAlb, 'SERIE');
      const aFecha = buscar(colsAlb, 'FECHA');
      const aCli = buscar(colsAlb, 'CODCLI');
      const aNom = buscar(colsAlb, 'NOMCLI');
      const aTotal = buscar(colsAlb, 'TOTDOC', 'TOTMONEDA');
      const aBase = buscar(colsAlb, 'BASEMONEDA', 'BASE');
      const aFacturado = buscar(colsAlb, 'FACTURADO');
      const aIdFac = buscar(colsAlb, 'IDFACV');
      const aSituacion = buscar(colsAlb, 'SITUACION');
      const aEntrega = buscar(colsAlb, 'FECENTREGA', 'FECHENTREGA', 'FECHAENTREGA');
      const aCerrado = buscar(colsAlb, 'CERRADO');

      if (aFecha) {
        pintar(
          'Albaranes · rango y volumen',
          await consulta(
            `SELECT MIN(${aFecha}) AS desde, MAX(${aFecha}) AS hasta, COUNT(*) AS albaranes
             FROM ${base}.dbo.CABEALBV`,
          ),
        );
      }

      if (aTotal) {
        pintar(
          'Albaranes · importe total',
          await consulta(`SELECT SUM(${aTotal}) AS importe_total FROM ${base}.dbo.CABEALBV`),
        );
      }

      // Columna que indica si el albarán está facturado.
      let condSinFacturar = null;
      let etiquetaFlag = null;
      if (aIdFac) {
        condSinFacturar = `(${aIdFac} IS NULL OR ${aIdFac} = 0)`;
        etiquetaFlag = `${aIdFac} vacío/0`;
      } else if (aFacturado) {
        condSinFacturar = `${aFacturado} = 0`;
        etiquetaFlag = `${aFacturado} = 0`;
      }

      if (condSinFacturar) {
        pintar(
          `Albaranes · SIN FACTURAR (${etiquetaFlag})`,
          await consulta(
            `SELECT COUNT(*) AS sin_facturar,
                    SUM(CASE WHEN ${aFecha} >= DATEADD(day, -365, GETDATE()) THEN 1 ELSE 0 END) AS ultimo_anio
             FROM ${base}.dbo.CABEALBV WHERE ${condSinFacturar}`,
          ),
        );

        const detalle = [aNum, aSerie, aFecha, aEntrega, aCli, aNom, aBase, aTotal, aSituacion]
          .filter(Boolean)
          .join(', ');
        if (detalle) {
          pintar(
            'Albaranes · muestra de los últimos sin facturar',
            await consulta(
              `SELECT TOP 15 ${detalle}
               FROM ${base}.dbo.CABEALBV
               WHERE ${condSinFacturar}
               ${aFecha ? `ORDER BY ${aFecha} DESC` : ''}`,
            ),
          );
        }
      } else {
        console.log('No encuentro una columna que marque el albarán como facturado (IDFACV / FACTURADO).');
        if (aCerrado) {
          pintar(
            `Albaranes · por ${aCerrado}`,
            await consulta(
              `SELECT ${aCerrado} AS cerrado, COUNT(*) AS albaranes FROM ${base}.dbo.CABEALBV GROUP BY ${aCerrado}`,
            ),
          );
        }
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
