/**
 * Diagnóstico: nombres de los proveedores que tienen artículos.
 * Solo lectura.
 *
 * Busca de forma amplia (cualquier tabla con CODPRO y una columna de nombre),
 * porque en este A3ERP la tabla de proveedores no se llama PROVEEDOR.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-proveedores.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));
const nombres = ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT'];
const entorno = Object.fromEntries(nombres.map((k) => [k, process.env[k] ?? '']));
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

      // Tablas con columna CODPRO (candidatas a maestro de proveedores).
      const tablas = await q(`SELECT DISTINCT t.name AS tabla
                              FROM ${base}.sys.tables t
                              JOIN ${base}.sys.columns c ON c.object_id = t.object_id
                              WHERE c.name = 'CODPRO'
                                 OR t.name LIKE '%PROVEED%' OR t.name LIKE '%ACREED%' OR t.name LIKE '%TERCER%'
                              ORDER BY t.name`);
      console.log('Tablas con CODPRO: ' + ((tablas ?? []).map((t) => t.tabla).join(', ') || '(ninguna)'));

      // Para cada candidata, ver si tiene nombre y sacar los proveedores usados.
      for (const t of tablas ?? []) {
        const cols = await q(`SELECT c.name AS columna FROM ${base}.sys.columns c
                              WHERE c.object_id = OBJECT_ID('${base}.dbo.${t.tabla}')`);
        const lista = (cols ?? []).map((c) => c.columna);
        const colNom = lista.find((c) => /^(NOMBRE|NOM|NOMBRECOMERCIAL|RAZONSOCIAL|DESCRIPCION)$/i.test(c))
          ?? lista.find((c) => /NOM|RAZON|DESCRIP/i.test(c));

        const total = await q(`SELECT COUNT(*) AS n FROM ${base}.dbo.[${t.tabla}]`);
        if (!colNom) {
          console.log(`\n${t.tabla}: ${total?.[0]?.n ?? '?'} filas · sin columna de nombre (${lista.slice(0, 8).join(', ')}…)`);
          continue;
        }

        const filas = await q(`SELECT TOP 40 p.CODPRO AS codigo, p.[${colNom}] AS nombre, COUNT(a.CODART) AS articulos
                               FROM ${base}.dbo.[${t.tabla}] p
                               LEFT JOIN ${base}.dbo.ARTICULO a ON LTRIM(RTRIM(a.CODPRO)) = LTRIM(RTRIM(p.CODPRO))
                               GROUP BY p.CODPRO, p.[${colNom}]
                               ORDER BY COUNT(a.CODART) DESC`);
        console.log(`\n${t.tabla} · nombre en ${colNom} · ${total?.[0]?.n ?? '?'} filas`);
        console.table(filas);
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
