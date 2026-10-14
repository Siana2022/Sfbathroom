import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));

function arg(nombre, argv = process.argv.slice(2)) {
  const i = argv.indexOf(nombre);
  return i === -1 ? undefined : argv[i + 1];
}

const desde = arg('--desde') || '2022-01-01';
const hasta = arg('--hasta') || new Date().toISOString().slice(0, 10);
const empresaSolo = arg('--empresa');
const top = Number(arg('--top') || '80');

const nombres = ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'MSSQL_DATABASE'];
const entorno = Object.fromEntries(nombres.map((k) => [k, process.env[k] ?? '']));
const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  database: entorno.MSSQL_DATABASE,
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

// Solo líneas que la app cuenta como unidades: facturas emitidas (Cargo) y componente 'F'.
const filtro = `WHERE c.FECHA >= CONVERT(datetime,'${desde}',120) AND c.FECHA <= CONVERT(datetime,'${hasta}',120) AND c.TIPODOC='Cargo' AND l.ESCOMPONENTE='F'`;
const n = (x) => Number(x) || 0;
const empresas = empresaSolo ? a3.empresas.filter((e) => e.codigo === empresaSolo) : a3.empresas;

// Columnas candidatas a "familia/grupo" del artículo (se usa la primera que exista).
const CAND_FAM = ['FAMILIA', 'CODFAMILIA', 'SUBFAMILIA', 'GRUPO', 'CODGRUPO', 'ARTGRUPO', 'GRUPOART', 'FAMILIAART'];

// Palabras que suelen delatar líneas que no son producto.
const KW = /transp|porte|env[ií]o|flete|gasto|ajuste|abono|descuent|comisi|servici|montaje|instalac|mano de obra|embalaj|seguro|rappel|financier|punteo|redondeo|\biva\b|recargo|devolu|cobro|suplido|anticipo/i;

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  const pool = await mssql.connect(conn);
  try {
    for (const e of empresas) {
      const base = e.base;
      const codigo = e.codigo;
      console.log(`\n============================== ${codigo} · base=${base} · ${desde}..${hasta} ==============================`);

      let colsArt = [];
      try {
        colsArt = (await pool.request().query(
          `SELECT COLUMN_NAME FROM [${base}].INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ARTICULO' ORDER BY ORDINAL_POSITION`,
        )).recordset.map((r) => r.COLUMN_NAME);
      } catch { /* sin permiso: seguimos sin familia */ }
      if (colsArt.length) console.log('columnas ARTICULO: ' + colsArt.join(', '));
      const famCol = colsArt.find((c) => CAND_FAM.includes(c.toUpperCase()));
      console.log(`columna de familia usada: ${famCol ?? '(ninguna)'}`);

      const campos = ['a.DESCART AS DESC'];
      if (famCol) campos.push(`a.[${famCol}] AS FAM`);
      const applyArt = `OUTER APPLY (SELECT TOP 1 ${campos.join(', ')} FROM [${base}].dbo.ARTICULO a WHERE a.CODART = l.CODART) a`;
      const famSel = famCol ? ', MAX(a.FAM) AS FAM' : '';

      const rows = (await pool.request().query(
        `SELECT LTRIM(RTRIM(l.CODART)) AS COD,
                MAX(a.DESC) AS DESC${famSel},
                COUNT(*) AS LINEAS,
                COUNT(DISTINCT l.IDFACV) AS FACTURAS,
                SUM(l.UNIDADES) AS U,
                SUM(l.BASEMONEDA) AS BASE
         FROM [${base}].dbo.CABEFACV c
         JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV
         ${applyArt}
         ${filtro}
         GROUP BY LTRIM(RTRIM(l.CODART))
         ORDER BY SUM(l.UNIDADES) DESC`,
      )).recordset;

      const totU = rows.reduce((s, r) => s + n(r.U), 0);
      const totBase = rows.reduce((s, r) => s + n(r.BASE), 0);
      console.log(`articulos distintos en lineas de factura: ${rows.length} · unidades totales=${totU.toFixed(2)} · base total=${totBase.toFixed(2)}`);

      if (famCol) {
        const porFam = new Map();
        for (const r of rows) {
          const k = r.FAM === null || r.FAM === undefined || String(r.FAM).trim() === '' ? '(sin familia)' : String(r.FAM);
          const v = porFam.get(k) ?? { art: 0, lineas: 0, facturas: 0, u: 0, base: 0 };
          v.art++; v.lineas += n(r.LINEAS); v.facturas += n(r.FACTURAS); v.u += n(r.U); v.base += n(r.BASE);
          porFam.set(k, v);
        }
        console.log(`\nresumen por ${famCol} (de mayor a menor unidades):`);
        for (const [k, v] of [...porFam.entries()].sort((a, b) => b[1].u - a[1].u)) {
          console.log(`  ${k.padEnd(30)} art=${String(v.art).padStart(4)} lineas=${String(v.lineas).padStart(6)} unidades=${v.u.toFixed(2).padStart(12)} base=${v.base.toFixed(2).padStart(14)}`);
        }
      }

      const head = ['CODIGO', 'NOMBRE', ...(famCol ? ['FAMILIA'] : []), 'LINEAS', 'FACTURAS', 'UNIDADES', 'BASE'];
      console.log(`\ntop ${top} articulos por unidades:`);
      console.log('  ' + head.join(' | '));
      for (const r of rows.slice(0, top)) {
        console.log('  ' + [r.COD, r.DESC, ...(famCol ? [r.FAM] : []), r.LINEAS, r.FACTURAS, n(r.U).toFixed(2), n(r.BASE).toFixed(2)].join(' | '));
      }

      const sos = rows.filter((r) => KW.test(String(r.DESC || '')) || KW.test(String(r.COD || '')));
      const sosU = sos.reduce((s, r) => s + n(r.U), 0);
      console.log(`\nSOSPECHOSOS de no ser producto (por nombre/codigo): ${sos.length} articulos · unidades=${sosU.toFixed(2)} (${totU > 0 ? ((100 * sosU) / totU).toFixed(2) : '0'}%)`);
      for (const r of sos) {
        console.log(`  ${String(r.COD).padEnd(14)} ${String(r.DESC || '').slice(0, 44).padEnd(44)} unidades=${n(r.U).toFixed(2).padStart(12)} base=${n(r.BASE).toFixed(2).padStart(12)}`);
      }

      const csv = ['\ufeff' + head.join(';'), ...rows.map((r) => [r.COD, r.DESC, ...(famCol ? [r.FAM] : []), r.LINEAS, r.FACTURAS, n(r.U), n(r.BASE)].map(csvEscape).join(';'))].join('\n');
      const fichero = `diag-articulos-${codigo}.csv`;
      writeFileSync(resolve(raiz, fichero), csv, 'utf8');
      console.log(`\n(volcado completo: ${fichero} · ${rows.length} filas)`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(`[diag-articulos] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
