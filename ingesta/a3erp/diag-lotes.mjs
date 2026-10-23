import { readFileSync } from 'node:fs';
import mssql from 'mssql';

const a3 = JSON.parse(readFileSync(new URL('./config/a3erp.config.json', import.meta.url), 'utf8'));

const pool = await mssql.connect({
  server: process.env.MSSQL_HOST,
  port: Number(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: process.env.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});

const bq = (x) => `[${x}]`;
const CANDIDATAS = ['LOTES', 'STOCKALM', 'LINEFACT', 'LINEFACC', 'CABEFACC', 'CABEFACV', 'LINEPEDI', 'LINEPROD', 'CONTENEDOR', 'PACLCONT'];

async function existeTabla(base, tabla) {
  const r = await pool.request().query(`SELECT 1 AS ok FROM ${bq(base)}.INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tabla}'`);
  return r.recordset.length > 0;
}

async function columnas(base, tabla) {
  const r = await pool.request().query(
    `SELECT COLUMN_NAME AS col FROM ${bq(base)}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tabla}' ORDER BY ORDINAL_POSITION`,
  );
  return r.recordset.map((x) => x.col);
}

async function contar(base, tabla) {
  try {
    const r = await pool.request().query(`SELECT COUNT(*) AS n FROM ${bq(base)}.dbo.${bq(tabla)}`);
    return r.recordset[0].n;
  } catch {
    return null;
  }
}

try {
  for (const empresa of a3.empresas) {
    const base = empresa.base;
    console.log(`\n==============================================`);
    console.log(`EMPRESA ${empresa.codigo} · base ${base}`);
    console.log(`==============================================`);

    const tablas = [];
    for (const t of CANDIDATAS) {
      if (await existeTabla(base, t)) {
        const cols = await columnas(base, t);
        tablas.push({ tabla: t, cols, filas: await contar(base, t) });
      }
    }

    for (const t of tablas) {
      console.log(`\n## ${t.tabla} (${t.filas ?? '?'} filas)`);
      if (/LOTE/.test(t.cols.join(','))) {
        try {
          const r = await pool.request().query(
            `SELECT COUNT(*) AS n FROM ${bq(base)}.dbo.${bq(t.tabla)} WHERE LOTE IS NOT NULL AND LTRIM(RTRIM(LOTE)) <> ''`,
          );
          console.log(`   filas con LOTE: ${r.recordset[0].n}`);
        } catch (e) {
          console.log(`   (no se pudo contar LOTE: ${e.message})`);
        }
      }
      const interes = t.cols.filter((c) => /LOTE|CONTEN|COSTE|PRECIO|IMPORTE|UNIDAD|CANTIDAD|ALMAC|FECHA|NUMDOC|CODPRO|CODART|ARTICULO/i.test(c));
      console.log('   ' + interes.join(', '));
    }

    for (const tabla of ['LINEFACC', 'CABEFACC', 'LINEFACT']) {
      if (!(await existeTabla(base, tabla))) continue;
      const cols = await columnas(base, tabla);
      if (!cols.includes('LOTE')) continue;
      try {
        const r = await pool.request().query(
          `SELECT TOP 5 * FROM ${bq(base)}.dbo.${bq(tabla)} WHERE LOTE IS NOT NULL AND LTRIM(RTRIM(LOTE)) <> ''`,
        );
        console.log(`\n-- Muestra ${tabla} con LOTE (5 filas) --`);
        for (const fila of r.recordset) {
          const resumen = Object.fromEntries(
            Object.entries(fila).filter(([k]) => /LOTE|ART|UNIDAD|CANTIDAD|PRECIO|COSTE|IMPORTE|NUMDOC|FECHA|PRO|ALM/i.test(k)),
          );
          console.log('   ' + JSON.stringify(resumen));
        }
      } catch (e) {
        console.log(`   (error muestra ${tabla}: ${e.message})`);
      }
    }
  }
} finally {
  await pool.close();
}
