/**
 * Carga las líneas de pedido desde los albaranes de A3ERP (LINEALBA).
 *
 * Requiere haber cargado antes los pedidos con vuelo-pedidos.mjs (guarda IDTOT).
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-lineas-pedido.mjs
 *   node --env-file=.env vuelo-lineas-pedido.mjs --empresa SF --desde 2024-01-01
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
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};
const soloEmpresa = arg('--empresa');
const desde = arg('--desde');
const PEDIDOS_POR_LOTE = 200;

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

const limpio = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

async function rpc(nombre, cuerpo) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${nombre} ${res.status}: ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

async function main() {
  const pool = await mssql.connect(conn);
  try {
    const empresas = soloEmpresa ? a3.empresas.filter((e) => e.codigo === soloEmpresa) : a3.empresas;
    for (const e of empresas) {
      const base = `[${e.base}]`;
      const filtro = desde ? `AND l.FECHA >= '${desde}'` : '';
      const sql = `
        SELECT l.IDPEDV, l.CODART, l.DESCLIN, l.UNIDADES, l.PRECIO, l.DESC1, l.LOTE, l.NUMLINPED
        FROM ${base}.dbo.LINEALBA l
        WHERE l.IDPEDV IS NOT NULL ${filtro}`;

      const filas = (await pool.request().query(sql)).recordset;
      const porPedido = new Map();
      for (const l of filas) {
        const id = Number(l.IDPEDV);
        if (!Number.isFinite(id)) continue;
        const lista = porPedido.get(id) ?? [];
        lista.push({
          id_pedido_erp: id,
          codigo_articulo: limpio(l.CODART),
          descripcion: limpio(l.DESCLIN),
          cantidad: num(l.UNIDADES),
          precio: num(l.PRECIO),
          descuento: num(l.DESC1),
          lote: limpio(l.LOTE),
          numero_linea: l.NUMLINPED === null ? null : Number(l.NUMLINPED),
        });
        porPedido.set(id, lista);
      }

      const ids = [...porPedido.keys()];
      console.log(`${e.codigo}: ${ids.length} pedidos con líneas · ${filas.length} líneas en ERP`);

      let lineas = 0;
      for (let i = 0; i < ids.length; i += PEDIDOS_POR_LOTE) {
        const trozo = ids.slice(i, i + PEDIDOS_POR_LOTE).flatMap((id) => porPedido.get(id) ?? []);
        if (trozo.length === 0) continue;
        const r = await rpc('reemplazar_lineas_pedido', { p_codigo_empresa: e.codigo, p_filas: trozo });
        lineas += Number(r?.lineas ?? 0);
      }
      console.log(`  insertadas ${lineas}`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
