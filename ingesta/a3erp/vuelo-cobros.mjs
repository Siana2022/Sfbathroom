/**
 * Carga de cobros y vencimientos desde A3ERP (tabla CARTERA).
 *
 * Por cada vencimiento guarda importe, cobrado, devuelto, fechas y si es dudoso.
 * El pendiente se calcula como IMPORTE - IMPORTECOB - IMPORTEDEVANT.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-cobros.mjs
 *   node --env-file=.env vuelo-cobros.mjs --empresa SF
 *   node --env-file=.env vuelo-cobros.mjs --desde 2024-01-01
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
const desde = arg('--desde') ?? '2020-01-01';
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

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const fecha = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const bool = (v) => v === true || v === 'T' || v === 't' || v === 1 || v === '1';

async function rpc(nombre, cuerpo) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${nombre} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const pool = await mssql.connect(conn);
  try {
    const empresas = soloEmpresa ? a3.empresas.filter((e) => e.codigo === soloEmpresa) : a3.empresas;
    for (const e of empresas) {
      const filas = (
        await pool.request().query(`
          SELECT IDCARTERA, NUMCARTERA, LTRIM(RTRIM(CODCLI)) AS CODCLI, NUMDOC,
                 FECHAFACTURA, FECHACALCULOVTO, FECHARECEPCION,
                 IMPORTE, IMPORTECOB, IMPORTEDEVANT, ESDUDOSOCOBRO
          FROM [${e.base}].dbo.CARTERA
          WHERE FECHAFACTURA >= CONVERT(datetime, '${desde}', 120)
        `)
      ).recordset;

      const registros = [];
      const vistos = new Set();
      for (const f of filas) {
        const numCartera = String(f.NUMCARTERA ?? f.IDCARTERA ?? '').trim();
        if (!numCartera || vistos.has(numCartera)) continue;
        vistos.add(numCartera);

        const importe = num(f.IMPORTE);
        const cobrado = num(f.IMPORTECOB);
        const devuelto = num(f.IMPORTEDEVANT);
        const pendiente = importe - cobrado - devuelto;

        registros.push({
          codigo_cliente: f.CODCLI ? String(f.CODCLI) : null,
          num_cartera: numCartera,
          numero_documento: f.NUMDOC ? String(f.NUMDOC).trim() : null,
          fecha_factura: fecha(f.FECHAFACTURA),
          fecha_vencimiento: fecha(f.FECHACALCULOVTO),
          fecha_cobro: pendiente <= 0.01 ? fecha(f.FECHARECEPCION) : null,
          importe,
          importe_cobrado: cobrado,
          importe_devuelto: devuelto,
          pendiente,
          es_dudoso: bool(f.ESDUDOSOCOBRO),
        });
      }

      console.log(`${e.codigo}: ${registros.length} vencimientos (de ${filas.length} filas)`);
      await rpc('limpiar_cobros_cartera', { p_codigo_empresa: e.codigo });
      let insertadas = 0;
      for (let i = 0; i < registros.length; i += LOTE) {
        const lote = registros.slice(i, i + LOTE);
        const r = await rpc('insertar_cobros_cartera', { p_codigo_empresa: e.codigo, p_filas: lote });
        insertadas += Number(r?.insertadas ?? 0);
      }
      console.log(`  insertadas ${insertadas}`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
