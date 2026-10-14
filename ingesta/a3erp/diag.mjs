import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));

function arg(nombre, argv = process.argv.slice(2)) {
  const i = argv.indexOf(nombre);
  return i === -1 ? undefined : argv[i + 1];
}

const desde = arg('--desde') || `${new Date().getFullYear()}-01-01`;
const hasta = arg('--hasta') || new Date().toISOString().slice(0, 10);
const referenciaRaw = arg('--referencia');
const empresaSolo = arg('--empresa');

function analiticoDe(codigo) {
  const raw = arg(`--an${codigo}`);
  return raw ? raw.split(',').map(Number) : null;
}

const nombres = ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'MSSQL_DATABASE'];
const entorno = Object.fromEntries(nombres.map((n) => [n, process.env[n] ?? '']));

const refs = new Map();
if (referenciaRaw) {
  for (const kv of referenciaRaw.split(',')) {
    const [k, v] = kv.trim().split(/\s+/);
    refs.set(k, Number(v));
  }
}

let añadidas = 0;
const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  database: entorno.MSSQL_DATABASE,
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

const empresas = (empresaSolo ? a3.empresas.filter((e) => e.codigo === empresaSolo) : a3.empresas).map((e) => e.codigo);
if (empresas.length === 0) throw new Error(`empresa no registrada: ${empresaSolo}`);

const filtro = `WHERE c.FECHA >= CONVERT(datetime, '${desde}', 120) AND c.FECHA <= CONVERT(datetime, '${hasta}', 120)`;
const bq = (x) => `[${x}]`;
const n = (x) => Number(x) || 0;

async function main() {
  const pool = await mssql.connect(conn);
  try {
    for (const codigo of empresas) {
      const e = a3.empresas.find((x) => x.codigo === codigo);
      const base = e.base;
      if (codigo === empresas[0]) {
        const qDb = await pool.request().query(`SELECT name FROM master.sys.databases ORDER BY name`);
        console.log(`Bases de datos en el servidor: ${qDb.recordset.map((r) => r.name).join(', ')}`);
      }

      const qDoc = await pool.request().query(
        `SELECT c.TIPODOC AS TIPODOC, c.SERIE AS SERIE, COUNT(*) AS N,
                SUM(c.BASEMONEDA) AS BASE, SUM(c.TOTMONEDA) AS TOTAL,
                SUM(ISNULL(c.TOTALSUPLIDOSMON,0)) AS PORTES, SUM(c.TOTDTOMONEDA) AS DESC_PIE
         FROM [${base}].dbo.CABEFACV c
         ${filtro}
         GROUP BY c.TIPODOC, c.SERIE
         ORDER BY c.TIPODOC, c.SERIE`,
      );

      const qSup = await pool.request().query(
        `SELECT COUNT(DISTINCT c.IDFACV) AS N_DOCS,
                SUM(l.UNIDADES * l.PRECIO * (1 - COALESCE(l.DESC1,0) / 100.0)) AS SUP_IMP,
                SUM(l.UNIDADES * l.PRECIO * (1 - COALESCE(l.DESC1,0) / 100.0)) AS SUP_IMP_NETO
         FROM [${base}].dbo.CABEFACV c
         JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV AND l.ESCOMPONENTE = 'S'
         ${filtro}`,
      );

      const qLinea = await pool.request().query(
        `SELECT COUNT(DISTINCT c.IDFACV) AS N_DOCS, COUNT(*) AS N_LINEAS,
                SUM(l.UNIDADES * l.PRECIO * (1 - COALESCE(l.DESC1,0) / 100.0)) AS LINEA_NETO
         FROM [${base}].dbo.CABEFACV c
         JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV AND l.ESCOMPONENTE = 'F'
         ${filtro}`,
      );

      console.log(`\n=== ${codigo} · base=${base} · desde=${desde} hasta=${hasta} ===`);
      for (const r of qDoc.recordset) {
        console.log(
          `${String(r.TIPODOC).padEnd(8)} ${String(r.SERIE).padEnd(8)} docs=${String(r.N).padStart(5)} ` +
          `base=${n(r.BASE).toFixed(2).padStart(13)} total=${n(r.TOTAL).toFixed(2).padStart(13)} ` +
          `portes=${n(r.PORTES).toFixed(2).padStart(11)} desc_pie=${n(r.DESC_PIE).toFixed(2).padStart(11)}`,
        );
      }

      let baseNeto = 0;
      let totalNeto = 0;
      let portesNeto = 0;
      for (const r of qDoc.recordset) {
        baseNeto += n(r.BASE);
        totalNeto += n(r.TOTAL);
        portesNeto += n(r.PORTES);
      }
      const supNeto = n(qSup.recordset[0]?.SUP_IMP_NETO);
      const supImp = n(qSup.recordset[0]?.SUP_IMP);
      const supDocs = n(qSup.recordset[0]?.N_DOCS);
      const lineaNeto = n(qLinea.recordset[0]?.LINEA_NETO);
      const nLineas = n(qLinea.recordset[0]?.N_LINEAS);

      const qComp = await pool.request().query(
        `SELECT l.ESCOMPONENTE AS K, COUNT(*) AS N,
                SUM(l.UNIDADES * l.PRECIO * (1 - COALESCE(l.DESC1,0) / 100.0)) AS IMP
         FROM [${base}].dbo.CABEFACV c
         JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV
         ${filtro}
         GROUP BY l.ESCOMPONENTE
         ORDER BY l.ESCOMPONENTE`,
      );

      console.log(`\nlíneas por ESCOMPONENTE (${desde}..${hasta}):`);
      let otroNeto = 0;
      for (const r of qComp.recordset) {
        const k = String(r.K);
        console.log(`  ${k.padEnd(4)} lineas=${String(r.N).padStart(6)} importe=${n(r.IMP).toFixed(2).padStart(13)}`);
        if (k !== 'F') otroNeto += n(r.IMP);
      }

      const ref6 = refs.get(codigo);
      const cand6 = baseNeto + otroNeto;
      const diff6 = ref6 === undefined ? '' : `  vsCliente(${codigo}): ${(ref6 - cand6).toFixed(2)}`;

      const cand = [
        ['C1 base cabecera (app)', baseNeto],
        ['C2 base+portes', baseNeto + portesNeto],
        ['C3 base+sup.neto', baseNeto + supNeto],
        ['C5 linea-F neto', lineaNeto],
        ['C4 total (con IVA)', totalNeto],
      ];
      console.log(`TOTAL base_neto=${baseNeto.toFixed(2)} portes_neto=${portesNeto.toFixed(2)} total_neto=${totalNeto.toFixed(2)}`);
      console.log(`suplementos  docs=${String(supDocs).padStart(5)} importe=${supImp.toFixed(2).padStart(13)} neto=${supNeto.toFixed(2).padStart(13)}`);
console.log(`lineas-F  docs=${String(n(qLinea.recordset[0]?.N_DOCS)).padStart(5)} lineas=${String(nLineas).padStart(6)} neto=${lineaNeto.toFixed(2).padStart(13)}`);
        console.log(`C6 base+otros componentes: ${cand6.toFixed(2)}${diff6}`);
        for (const [nombre, v] of cand) {
        const ref = refs.get(codigo);
        const diff = ref === undefined ? '' : `  vsCliente(${codigo}): ${(ref - v).toFixed(2)}`;
        console.log(`${nombre}: ${v.toFixed(2)}${diff}`);
      }

      const qCols = await pool.request().query(
        `SELECT col.name AS COL_NAME FROM [${base}].sys.columns col
         JOIN [${base}].sys.tables t ON t.object_id = col.object_id
         WHERE t.name = 'CABEFACV' AND t.schema_id = 1 AND col.name LIKE 'FECHA%'
         ORDER BY col.name`,
      );
      const cols = (qCols.recordset.map((r) => r.COL_NAME)).filter((x) => typeof x === 'string' && x.length > 0);
      console.log(`\ncolumnas 'FECHA%' en CABEFACV: ${cols.join(', ') || '(ninguna)'}`);

      for (const dc of cols.filter((x) => x !== 'FECHA')) {
        const qMes = await pool.request().query(
          `SELECT YEAR(c.${bq(dc)}) AS Y, MONTH(c.${bq(dc)}) AS M, COUNT(*) AS N, SUM(c.BASEMONEDA) AS BASE
           FROM [${base}].dbo.CABEFACV c
           WHERE c.${bq(dc)} >= CONVERT(datetime, '${desde}', 120) AND c.${bq(dc)} <= CONVERT(datetime, '${hasta}', 120)
           GROUP BY YEAR(c.${bq(dc)}), MONTH(c.${bq(dc)})
           ORDER BY YEAR(c.${bq(dc)}), MONTH(c.${bq(dc)})`,
        );
        let tot = 0;
        console.log(`-- YTD por ${dc} (${desde}..${hasta}) --`);
        for (const r of qMes.recordset) {
          tot += n(r.BASE);
          console.log(`  ${r.Y}-${String(r.M).padStart(2, '0')}: ${String(r.N).padStart(4)} docs  base=${n(r.BASE).toFixed(2)}`);
        }
        const ref = refs.get(codigo);
        const diff = ref === undefined ? '' : `  vsCliente(${codigo}): ${(ref - tot).toFixed(2)}`;
        console.log(`  TOTAL base por ${dc} = ${tot.toFixed(2)}${diff}`);
      }

      for (const dc of cols.filter((x) => x !== 'FECHA')) {
        const qCruza = await pool.request().query(
          `SELECT c.SERIE, CAST(c.NUMDOC AS bigint) AS NUMDOC, c.TIPODOC,
                  CONVERT(varchar(10), c.FECHA, 120) AS FECHA,
                  CONVERT(varchar(10), c.${bq(dc)}, 120) AS OTRA,
                  c.BASEMONEDA AS BASE
           FROM [${base}].dbo.CABEFACV c
           WHERE ((c.FECHA >= CONVERT(datetime, '2025-11-01', 120) AND c.FECHA <= CONVERT(datetime, '${hasta}', 120))
               OR (c.${bq(dc)} >= CONVERT(datetime, '2025-11-01', 120) AND c.${bq(dc)} <= CONVERT(datetime, '${hasta}', 120)))
             AND YEAR(c.FECHA) <> YEAR(c.${bq(dc)})
           ORDER BY c.FECHA`,
        );
        console.log(`-- documentos con FECHA != ${dc} (nov2025→${hasta}): ${qCruza.recordset.length} --`);
        for (const r of qCruza.recordset) {
          console.log(`  ${r.SERIE}-${r.NUMDOC} ${String(r.TIPODOC).padEnd(6)} FECHA=${r.FECHA} ${dc}=${r.OTRA} base=${n(r.BASE).toFixed(2)}`);
        }
        añadidas += qCruza.recordset.length;
      }

      const qLiCols = await pool.request().query(
        `SELECT col.name AS C FROM [${base}].sys.columns col
         JOIN [${base}].sys.tables t ON t.object_id = col.object_id
         WHERE t.name = 'LINEFACT' AND t.schema_id = 1
         ORDER BY col.name`,
      );
      const liCols = new Set(qLiCols.recordset.map((r) => String(r.C)));
      const metas = ['DESC1', 'DESC2', 'DESC3', 'BASEMONEDA', 'RAPPEL', 'RAPPELMONEDA', 'SALVAMENTO', 'SALVAMONEDA', 'TOPE', 'DTO1', 'DTO2', 'DTO3'];
      const presentes = metas.filter((c) => liCols.has(c));
      console.log(`\ncolumnas LINEFACT presentes (descuentos/base): ${presentes.join(', ') || '(ninguna)'}`);
      const sospechosos = [...liCols].filter((c) => /DESC|DTO|RAPPEL|SALVA|PRECIO|BASE|IMPORTE/i.test(c) && !/^(FECHA|HORA)/i.test(c));
      if (sospechosos.length) console.log(`  otras columnas de interés: ${sospechosos.sort().join(', ')}`);

      const factorDesc2y3 = ['DESC2', 'DESC3'].filter((c) => liCols.has(c));
      const factorX = factorDesc2y3.length ? factorDesc2y3.map((c) => `(1 - COALESCE(l.${bq(c)}, 0) / 100.0)`).join(' * ') : '1';
      const lineaBaseSel = liCols.has('BASEMONEDA') ? `, SUM(ROUND(l.BASEMONEDA, 2)) AS LINEA_BASE` : '';
      const qTest = await pool.request().query(
        `SELECT YEAR(c.FECHA) AS Y, MONTH(c.FECHA) AS M, COUNT(DISTINCT c.IDFACV) AS N_DOCS,
                SUM(ROUND(l.UNIDADES * l.PRECIO * (1 - COALESCE(l.DESC1, 0) / 100.0), 2)) AS SOLO_DESC1,
                SUM(ROUND(l.UNIDADES * l.PRECIO * (1 - COALESCE(l.DESC1, 0) / 100.0) * ${factorX}, 2)) AS CON_DESC23
                ${lineaBaseSel}
         FROM [${base}].dbo.CABEFACV c
         JOIN [${base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV AND l.ESCOMPONENTE = 'F'
         ${filtro}
         GROUP BY YEAR(c.FECHA), MONTH(c.FECHA)
         ORDER BY YEAR(c.FECHA), MONTH(c.FECHA)`,
      );
      const anSerie = analiticoDe(codigo);
      const colLabel = liCols.has('BASEMONEDA') ? ' · líneaBas' : '';
      console.log(`analítico test por mes (Neto informado comparado con: solo DESC1, con DESC2/3${colLabel}) · rango ${desde}..${hasta}:`);
      console.log(`  mes | docs | analítico | soloDESC1 | d1 | conDESC23 | d2${liCols.has('BASEMONEDA') ? ' | líneaBas | d3' : ''}`);
      for (const r of qTest.recordset) {
        const idx = (r.M - 1) % 12;
        const ref = anSerie?.[idx];
        const r1 = n(r.SOLO_DESC1);
        const r2 = n(r.CON_DESC23);
        const rl = n(r.LINEA_BASE);
        const fila = `${String(r.M).padStart(2)} | ${String(r.N_DOCS).padStart(4)} | ${ref === undefined ? '      -     ' : ref.toFixed(2)} | ${r1.toFixed(2).padStart(10)} | ${ref === undefined ? '   ' : (ref - r1).toFixed(2).padStart(5)} | ${r2.toFixed(2).padStart(10)} | ${ref === undefined ? '   ' : (ref - r2).toFixed(2).padStart(5)}${liCols.has('BASEMONEDA') ? ` | ${rl.toFixed(2).padStart(10)} | ${ref === undefined ? '   ' : (ref - rl).toFixed(2).padStart(5)}` : ''}`;
        console.log(fila);
      }
      if (anSerie) {
        const acc = { a: 0, v1: 0, v2: 0 };
        for (const [idx, r] of qTest.recordset.entries()) {
          acc.a += anSerie[idx] ?? 0;
          acc.v1 += n(r.SOLO_DESC1);
          acc.v2 += n(r.CON_DESC23);
        }
        console.log(`  TOTAL              analítico=${acc.a.toFixed(2)} soloDESC1=${acc.v1.toFixed(2)} (diff=${(acc.a - acc.v1).toFixed(2)}) conDESC23=${acc.v2.toFixed(2)} (diff=${(acc.a - acc.v2).toFixed(2)})`);
      }
    }
    console.log(`\ndocumentos que cruzan de fecha: ${añadidas}`);

    const qDb = await pool.request().query(`SELECT name FROM master.sys.databases ORDER BY name`);
      const sistema = new Set(['master', 'model', 'msdb', 'tempdb', 'A3ERP$SISTEMA']);
      console.log(`\n=== ESCANEO DE BASES DE DATOS (ventas 2026 por CABEFACV.BASEMONEDA) ===`);
      for (const r of qDb.recordset) {
        const db = String(r.name);
        if (sistema.has(db)) continue;
        try {
          const q = await pool.request().query(
            `SELECT COUNT(*) AS N, SUM(c.BASEMONEDA) AS BASE
             FROM [${db}].dbo.CABEFACV c ${filtro}`,
          );
          const base2026 = n(q.recordset[0]?.BASE);
          const diffs = ['SF', 'DOT', 'FUX'].map((k) => {
            const ref = refs.get(k);
            return ref === undefined ? '' : ` ${k}:${(ref - base2026).toFixed(2)}`;
          }).join('');
          console.log(`  ${db.padEnd(18)} docs=${String(q.recordset[0]?.N).padStart(5)} base2026=${base2026.toFixed(2).padStart(14)}${diffs}`);
        } catch (e) {
          console.log(`  ${db.padEnd(18)} (sin tabla CABEFACV / ${(e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 60)})`);
        }
      }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(`[diag] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});