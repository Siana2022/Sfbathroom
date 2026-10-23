import { readFileSync } from 'node:fs';
import mssql from 'mssql';

const a3 = JSON.parse(readFileSync(new URL('./config/a3erp.config.json', import.meta.url), 'utf8'));
const argv = process.argv.slice(2);
const arg = (nombre, def) => {
  const i = argv.indexOf(nombre);
  return i === -1 ? def : argv[i + 1];
};
const codigo = arg('--empresa', 'SF');
const empresa = a3.empresas.find((e) => e.codigo === codigo);
if (!empresa) throw new Error(`empresa no registrada: ${codigo}`);
const base = empresa.base;

const pool = await mssql.connect({
  server: process.env.MSSQL_HOST,
  port: Number(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: process.env.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});

const bq = (x) => `[${x}]`;

try {
  console.log(`\n=== ${codigo} · base ${base} ===`);

  const tablas = await pool.request().query(`
    SELECT t.name AS tabla, COALESCE(SUM(p.rows), 0) AS filas
    FROM ${bq(base)}.sys.tables t
    LEFT JOIN ${bq(base)}.sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    WHERE t.name LIKE '%STOCK%' OR t.name LIKE '%EXISTEN%' OR t.name LIKE '%ARTALM%'
       OR t.name LIKE '%ARTICULO%ALM%' OR t.name LIKE '%ALMACEN%' OR t.name LIKE '%LOTE%'
    GROUP BY t.name
    ORDER BY t.name
  `);
  console.log('\n-- Tablas candidatas (nombre) --');
  for (const r of tablas.recordset) console.log(`  ${r.tabla.padEnd(40)} ${r.filas} filas`);

  const columnas = await pool.request().query(`
    SELECT t.name AS tabla, c.name AS columna, ty.name AS tipo
    FROM ${bq(base)}.sys.columns c
    JOIN ${bq(base)}.sys.tables t ON t.object_id = c.object_id
    JOIN ${bq(base)}.sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE c.name LIKE '%STOCK%' OR c.name LIKE '%EXISTEN%' OR c.name LIKE '%LOTE%'
       OR c.name LIKE '%ALMAC%' OR c.name LIKE '%CONTE%'
    ORDER BY t.name, c.column_id
  `);
  console.log('\n-- Columnas candidatas (tabla.columna) --');
  let tablaActual = '';
  for (const r of columnas.recordset) {
    if (r.tabla !== tablaActual) {
      tablaActual = r.tabla;
      console.log(`\n  [${r.tabla}]`);
    }
    console.log(`    ${r.columna}: ${r.tipo}`);
  }
} finally {
  await pool.close();
}
