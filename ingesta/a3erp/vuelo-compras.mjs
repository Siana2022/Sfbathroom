/**
 * Carga coste real por lote y stock en mar desde A3ERP.
 *
 * - Coste por lote: CABEALBC (CAMBIO) + LINEALBA (CODART, LOTE, PRECIO, UNIDADES).
 *   coste_eur = PRECIO * CAMBIO, redondeado a 2 decimales.
 * - Stock en mar: CABEPEDC + LINEPEDI (pedidos de compra pendientes de recibir).
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-compras.mjs
 *   node --env-file=.env vuelo-compras.mjs --empresa SF
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));

const entorno = Object.fromEntries(
  ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .map((n) => [n, process.env[n] ?? '']),
);

if (!entorno.MSSQL_HOST || !entorno.SUPABASE_URL || !entorno.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan variables: ejecuta con el .env de la ingesta.');
  process.exit(1);
}

const SUPABASE = entorno.SUPABASE_URL.replace(/\/$/, '');
const CABECERAS = {
  apikey: entorno.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${entorno.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? undefined : process.argv[i + 1];
}

const soloEmpresa = arg('--empresa');
const norm = (v) => String(v ?? '').trim();
const LOTE = 500;

async function getSupabase(ruta) {
  const res = await fetch(`${SUPABASE}/rest/v1/${ruta}`, { headers: CABECERAS });
  if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function borrar(tabla, empresaId) {
  const res = await fetch(`${SUPABASE}/rest/v1/${tabla}?empresa_id=eq.${empresaId}`, {
    method: 'DELETE',
    headers: CABECERAS,
  });
  if (!res.ok) throw new Error(`DELETE ${tabla}: ${res.status} ${await res.text()}`);
}

async function insertar(tabla, filas) {
  for (let i = 0; i < filas.length; i += LOTE) {
    const res = await fetch(`${SUPABASE}/rest/v1/${tabla}`, {
      method: 'POST',
      headers: CABECERAS,
      body: JSON.stringify(filas.slice(i, i + LOTE)),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const empresasSupabase = await getSupabase('empresas?select=id,codigo');
  const idDe = new Map(empresasSupabase.map((e) => [e.codigo, e.id]));
  const empresas = a3.empresas.filter((e) => !soloEmpresa || e.codigo === soloEmpresa);

  const pool = await mssql.connect(conn);
  try {
    for (const e of empresas) {
      const empresaId = idDe.get(e.codigo);
      if (!empresaId) continue;

      // 1. Coste real por lote (albaranes de compra)
      const sqlLotes = `SELECT LTRIM(RTRIM(l.CODART)) AS ARTICULO,
                               COALESCE(LTRIM(RTRIM(l.LOTE)), '') AS LOTE,
                               CONVERT(varchar(10), c.FECHA, 120) AS FECHA,
                               SUM(l.UNIDADES) AS UNIDADES,
                               CASE WHEN SUM(l.UNIDADES) > 0
                                    THEN SUM(l.UNIDADES * l.PRECIO * ISNULL(c.CAMBIO, 1)) / SUM(l.UNIDADES)
                                    ELSE 0 END AS COSTE,
                               LTRIM(RTRIM(ISNULL(c.SERIE, ''))) + '-' + CAST(CAST(c.NUMDOC AS bigint) AS varchar(20)) AS DOCUMENTO
                        FROM [${e.base}].dbo.CABEALBC c
                        JOIN [${e.base}].dbo.LINEALBA l ON l.IDALBC = c.IDALBC
                        WHERE l.CODART IS NOT NULL AND l.UNIDADES > 0
                        GROUP BY LTRIM(RTRIM(l.CODART)), COALESCE(LTRIM(RTRIM(l.LOTE)), ''), CONVERT(varchar(10), c.FECHA, 120),
                                 LTRIM(RTRIM(ISNULL(c.SERIE, ''))) + '-' + CAST(CAST(c.NUMDOC AS bigint) AS varchar(20))`;
      const filasLotes = (await pool.request().query(sqlLotes)).recordset;
      const lotes = filasLotes.map((f) => ({
        empresa_id: empresaId,
        articulo_codigo: norm(f.ARTICULO),
        lote: norm(f.LOTE),
        fecha: norm(f.FECHA),
        unidades: Number(f.UNIDADES ?? 0),
        coste_unitario: Math.round(Number(f.COSTE ?? 0) * 100) / 100,
        documento: norm(f.DOCUMENTO),
      })).filter((f) => f.articulo_codigo !== '' && f.fecha !== '');

      await borrar('lotes_coste', empresaId);
      await insertar('lotes_coste', lotes);

      // 2. Stock en mar (pedidos de compra pendientes)
      const sqlMar = `SELECT LTRIM(RTRIM(l.CODART)) AS ARTICULO,
                             MAX(a.DESCART) AS NOMBRE,
                             SUM(CASE WHEN l.UNIDADES - ISNULL(l.UNIDADESSTOCK, 0) > 0
                                      THEN l.UNIDADES - ISNULL(l.UNIDADESSTOCK, 0) ELSE 0 END) AS UNIDADES,
                             COUNT(DISTINCT c.IDPEDC) AS PEDIDOS
                      FROM [${e.base}].dbo.CABEPEDC c
                      JOIN [${e.base}].dbo.LINEPEDI l ON l.IDPEDC = c.IDPEDC
                      LEFT JOIN [${e.base}].dbo.ARTICULO a ON a.CODART = l.CODART
                      WHERE l.CODART IS NOT NULL
                      GROUP BY LTRIM(RTRIM(l.CODART))
                      HAVING SUM(CASE WHEN l.UNIDADES - ISNULL(l.UNIDADESSTOCK, 0) > 0
                                      THEN l.UNIDADES - ISNULL(l.UNIDADESSTOCK, 0) ELSE 0 END) > 0`;
      const filasMar = (await pool.request().query(sqlMar)).recordset;
      const mar = filasMar.map((f) => ({
        empresa_id: empresaId,
        articulo_codigo: norm(f.ARTICULO),
        articulo_nombre: norm(f.NOMBRE) || null,
        unidades: Number(f.UNIDADES ?? 0),
        pedidos: Number(f.PEDIDOS ?? 0),
      })).filter((f) => f.articulo_codigo !== '');

      await borrar('stock_en_mar', empresaId);
      await insertar('stock_en_mar', mar);

      console.log(`${e.codigo}: ${lotes.length} lotes de compra · ${mar.length} artículos en mar`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
