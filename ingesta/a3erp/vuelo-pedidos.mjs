/**
 * Carga de pedidos de venta (CABEPEDV) en Supabase.
 *
 * Sustituye al proceso externo que dejó de actualizar la tabla: lee todos los
 * pedidos del ERP, resuelve el cliente por código y hace upsert por
 * (empresa, serie, numero_erp). Incluye FECENTREGA en `fecha_prometida`, que es
 * lo que usa la cartera de entregas programadas.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-pedidos.mjs
 *   node --env-file=.env vuelo-pedidos.mjs --empresa SF
 *   node --env-file=.env vuelo-pedidos.mjs --desde 2025-01-01
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
const desdeFijo = arg('--desde');
const lote = 500;

const norm = (v) => String(v ?? '').trim();

function estadoDe(situacion) {
  const s = norm(situacion).toUpperCase();
  if (s === 'A') return 'anulado';
  if (s === 'S') return 'servido';
  return 'captado';
}

async function getSupabase(ruta) {
  const res = await fetch(`${SUPABASE}/rest/v1/${ruta}`, { headers: CABECERAS });
  if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function clientesDe(empresaId) {
  const salida = [];
  for (let off = 0; ; off += 1000) {
    const filas = await getSupabase(
      `clientes?select=id,codigo_erp&empresa_id=eq.${empresaId}&limit=1000&offset=${off}`,
    );
    salida.push(...filas);
    if (filas.length < 1000) break;
  }
  return salida;
}

async function upsert(filas) {
  const res = await fetch(`${SUPABASE}/rest/v1/pedidos?on_conflict=serie,numero_erp,empresa_id`, {
    method: 'POST',
    headers: { ...CABECERAS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`upsert pedidos: ${res.status} ${await res.text()}`);
}

async function main() {
  const empresasSupabase = await getSupabase('empresas?select=id,codigo');
  const idDe = new Map(empresasSupabase.map((e) => [e.codigo, e.id]));
  const empresas = a3.empresas.filter((e) => !soloEmpresa || e.codigo === soloEmpresa);

  const pool = await mssql.connect(conn);
  try {
    for (const e of empresas) {
      const empresaId = idDe.get(e.codigo);
      if (!empresaId) {
        console.log(`${e.codigo}: sin empresa en Supabase, se omite`);
        continue;
      }

      // Clientes de la empresa: código ERP → uuid
      const clientes = await clientesDe(empresaId);
      const clientePorCodigo = new Map(
        clientes.map((c) => [norm(c.codigo_erp), c.id]).filter(([k]) => k !== ''),
      );

      const filtro = desdeFijo ? `WHERE FECHA >= '${desdeFijo}'` : '';
      const sql = `SELECT CAST(CAST(NUMDOC AS bigint) AS varchar(20)) AS NUMDOC,
                          LTRIM(RTRIM(SERIE)) AS SERIE,
                          CONVERT(varchar(10), FECHA, 120) AS FECHA,
                          CONVERT(varchar(10), FECENTREGA, 120) AS ENTREGA,
                          LTRIM(RTRIM(CODCLI)) AS CODCLI,
                          NOMCLI,
                          SITUACION,
                          BASEMONEDA,
                          TOTMONEDA
                   FROM [${e.base}].dbo.CABEPEDV
                   ${filtro}
                   ORDER BY FECHA`;

      const filas = (await pool.request().query(sql)).recordset;
      const salida = filas.map((f) => ({
        numero_erp: norm(f.NUMDOC),
        serie: norm(f.SERIE),
        fecha: norm(f.FECHA),
        fecha_entrada: norm(f.FECHA),
        fecha_prometida: norm(f.ENTREGA) || null,
        cliente_codigo: norm(f.CODCLI) || null,
        cliente_nombre: norm(f.NOMCLI) || null,
        cliente_id: clientePorCodigo.get(norm(f.CODCLI)) ?? null,
        estado: estadoDe(f.SITUACION),
        situacion: norm(f.SITUACION) || null,
        base_imponible: f.BASEMONEDA === null ? null : Number(f.BASEMONEDA),
        total: f.TOTMONEDA === null ? null : Number(f.TOTMONEDA),
        empresa_id: empresaId,
      }));

      let enviados = 0;
      for (let i = 0; i < salida.length; i += lote) {
        await upsert(salida.slice(i, i + lote));
        enviados += Math.min(lote, salida.length - i);
      }
      const sinCliente = salida.filter((s) => !s.cliente_id).length;
      console.log(
        `${e.codigo}: ${filas.length} pedidos en ERP · ${enviados} subidos · ${sinCliente} sin cliente · ${salida.filter((s) => s.fecha_prometida).length} con fecha de entrega`,
      );
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
