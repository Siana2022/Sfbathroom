import { readFileSync } from 'node:fs';
import mssql from 'mssql';

const a3 = JSON.parse(readFileSync(new URL('./config/a3erp.config.json', import.meta.url), 'utf8'));

const PROVEEDORES = [
  '625','745','615','308','720','620','421','P516','172','30','430','802','P10018','671',
  '33','626','258','534','458','568','653','P596','453','718','746','296','247','P186','288',
  '400','587','403','744','275','12','304','439','585','434','562','682','348','310','794',
];

const pool = await mssql.connect({
  server: process.env.MSSQL_HOST,
  port: Number(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: process.env.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});
const bq = (x) => `[${x}]`;

async function existe(base, tabla) {
  const r = await pool.request().query(`SELECT 1 AS ok FROM ${bq(base)}.INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tabla}'`);
  return r.recordset.length > 0;
}
async function columnas(base, tabla) {
  const r = await pool.request().query(
    `SELECT COLUMN_NAME AS col FROM ${bq(base)}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tabla}' ORDER BY ORDINAL_POSITION`,
  );
  return r.recordset.map((x) => x.col);
}

const inProv = PROVEEDORES.map((p) => `'${p}'`).join(',');

try {
  for (const empresa of a3.empresas) {
    const base = empresa.base;
    console.log(`\n==============================================`);
    console.log(`EMPRESA ${empresa.codigo} · base ${base}`);
    console.log(`==============================================`);

    for (const [tabla, patron] of [
      ['CABEFACC', /CLI|ALB|REF|OBS|OBRA|LOTE|CONTEN|PED|EXPED|SU|DOC|MATRIC|DIR|PRO/i],
      ['LINEFACC', /ART|DESC|LOTE|CANT|UNID|PRECIO|COSTE|IMPORTE|ALB|REF|OBS|CONTEN|PED/i],
      ['CABEALBV', /CLI|ALB|REF|OBS|FECHA|NUM|PRO/i],
      ['LINEALBV', /ART|DESC|LOTE|CANT|UNID|PRECIO|IMPORTE|PESO|VOLUMEN|ALB/i],
    ]) {
      if (!(await existe(base, tabla))) {
        console.log(`\n## ${tabla}: NO EXISTE`);
        continue;
      }
      const cols = await columnas(base, tabla);
      const inter = cols.filter((c) => patron.test(c));
      console.log(`\n## ${tabla}`);
      console.log('   ' + inter.join(', '));
    }

    if (await existe(base, 'CABEFACC')) {
      const cols = await columnas(base, 'CABEFACC');
      const inter = cols.filter((c) => /CLI|ALB|REF|OBS|OBRA|LOTE|CONTEN|PED|EXPED|SU|DOC|MATRIC|DIR/i.test(c));
      if (inter.length) {
        const sel = inter.map((c) => bq(c)).join(', ');
        const r = await pool.request().query(
          `SELECT TOP 8 ${sel} FROM ${bq(base)}.dbo.CABEFACC
           WHERE LTRIM(RTRIM(CODPRO)) IN (${inProv}) AND FECHA >= '2026-01-01'
           ORDER BY FECHA DESC`,
        );
        console.log('\n-- CABEFACC (facturas transporte 2026, campos candidatos) --');
        for (const fila of r.recordset) console.log('   ' + JSON.stringify(fila));
      }
    }

    if ((await existe(base, 'CABEFACC')) && (await existe(base, 'LINEFACC'))) {
      const cols = await columnas(base, 'LINEFACC');
      const inter = cols.filter((c) => /ART|DESC|LOTE|CANT|UNID|PRECIO|COSTE|IMPORTE|ALB|REF|OBS|CONTEN|PED/i.test(c));
      if (inter.length) {
        const sel = inter.map((c) => `L.${bq(c)}`).join(', ');
        const r = await pool.request().query(
          `SELECT TOP 8 ${sel}
           FROM ${bq(base)}.dbo.LINEFACC L
           JOIN ${bq(base)}.dbo.CABEFACC C ON C.IDFACC = L.IDFACC
           WHERE LTRIM(RTRIM(C.CODPRO)) IN (${inProv}) AND C.FECHA >= '2026-01-01'
           ORDER BY C.FECHA DESC`,
        );
        console.log('\n-- LINEFACC (líneas de facturas transporte 2026) --');
        for (const fila of r.recordset) console.log('   ' + JSON.stringify(fila));
      }
    }

    for (const [tabla, campo] of [['LOTES', 'LOTE'], ['STOCKALM', 'LOTE'], ['LINEFACT', 'LOTE'], ['LINEALBV', 'LOTE']]) {
      if (!(await existe(base, tabla))) continue;
      try {
        const r = await pool.request().query(
          `SELECT COUNT(*) AS n FROM ${bq(base)}.dbo.${bq(tabla)} WHERE LOTE IS NOT NULL AND LTRIM(RTRIM(LOTE)) <> ''`,
        );
        console.log(`\n${tabla}: ${r.recordset[0].n} filas con ${campo}`);
      } catch (e) {
        console.log(`\n${tabla}: error ${e.message}`);
      }
    }
  }
} finally {
  await pool.close();
}
