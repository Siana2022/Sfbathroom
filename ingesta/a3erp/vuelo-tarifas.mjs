/**
 * Carga de tarifas y precios especiales de A3ERP.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-tarifas.mjs
 *   node --env-file=.env vuelo-tarifas.mjs --empresa SF
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
const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? undefined : process.argv[i + 1];
};
const soloEmpresa = arg('--empresa');
const LOTE = 500;

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
const fecha = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

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

      const tarifasRaw = (
        await pool.request().query(`SELECT TARIFA, DESCTARIFA, TIPO FROM ${base}.dbo.TARIFAS`)
      ).recordset;
      const tarifas = tarifasRaw
        .map((t) => ({ codigo: limpio(t.TARIFA), nombre: limpio(t.DESCTARIFA), tipo: limpio(t.TIPO) }))
        .filter((t) => t.codigo && t.nombre);

      const preciosRaw = (
        await pool.request().query(`SELECT CODART, CODCLI, CODPRO, PRECIO, UNIDADES, CODMON, TIPREG, FECMIN, FECMAX
                                    FROM ${base}.dbo.PRCESP`)
      ).recordset;
      const precios = preciosRaw
        .map((p) => ({
          codigo_articulo: limpio(p.CODART),
          codigo_cliente: limpio(p.CODCLI),
          codigo_proveedor: limpio(p.CODPRO),
          precio: Number(p.PRECIO ?? 0),
          unidades: p.UNIDADES === null ? null : Number(p.UNIDADES),
          moneda: limpio(p.CODMON),
          tipo_regla: limpio(p.TIPREG),
          fecha_desde: fecha(p.FECMIN),
          fecha_hasta: fecha(p.FECMAX),
        }))
        .filter((p) => p.codigo_articulo || p.codigo_cliente || p.codigo_proveedor);

      console.log(`${e.codigo}: ${tarifas.length} tarifas · ${precios.length} precios especiales`);
      await rpc('limpiar_tarifas', { p_codigo_empresa: e.codigo });

      for (let i = 0; i < tarifas.length; i += LOTE) {
        await rpc('insertar_tarifas', { p_codigo_empresa: e.codigo, p_filas: tarifas.slice(i, i + LOTE) });
      }
      for (let i = 0; i < precios.length; i += LOTE) {
        await rpc('insertar_precios_especiales', { p_codigo_empresa: e.codigo, p_filas: precios.slice(i, i + LOTE) });
      }
      console.log(`  cargado.`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
