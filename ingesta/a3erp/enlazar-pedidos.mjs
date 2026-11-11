/**
 * Enlaza cada factura con su pedido (fechas) sin recargar ventas.
 *
 * Usa la consulta `sqlFechasPedido` de config y llama al RPC
 * `enlazar_fechas_pedido` (migraciones 0046 y 0047). Sirve para rellenar el
 * histórico rápido, o para reparar el enlace si la reconciliación falló.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   npm run enlazar:pedidos                 # todas las empresas, desde 2021
 *   npm run enlazar:pedidos -- --empresa SF
 *   npm run enlazar:pedidos -- --desde 2025-01-01 --hasta 2026-12-31
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '.');
const a3 = JSON.parse(readFileSync(resolve(raiz, 'config/a3erp.config.json'), 'utf8'));

const nombres = ['MSSQL_HOST', 'MSSQL_PORT', 'MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_ENCRYPT', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PERIODO_START'];
const entorno = Object.fromEntries(nombres.map((n) => [n, process.env[n] ?? '']));

if (!entorno.MSSQL_HOST || !entorno.SUPABASE_URL || !entorno.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan variables: ejecuta con el .env de la ingesta (`npm run enlazar:pedidos`).');
  process.exit(1);
}

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? undefined : process.argv[i + 1];
}

const soloEmpresa = arg('--empresa');
const desdeFijo = arg('--desde');
const hastaFijo = arg('--hasta');

const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fechaISODe(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return iso(v);
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function tramosMensuales(desde, hasta) {
  const out = [];
  const [y0, m0] = desde.split('-').map(Number);
  const [y1, m1] = hasta.split('-').map(Number);
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m++) {
    if (m > 12) { m = 1; y++; }
    const ini = `${y}-${String(m).padStart(2, '0')}-01`;
    const fin = iso(new Date(y, m, 0));
    out.push({ desde: y === y0 && m === m0 ? desde : ini, hasta: y === y1 && m === m1 ? hasta : fin });
  }
  return out;
}

async function muestraFacturas(empresaCodigo) {
  const base = entorno.SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: entorno.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${entorno.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const empresas = await (await fetch(`${base}/rest/v1/empresas?select=id&codigo=eq.${empresaCodigo}`, { headers })).json();
  const id = empresas?.[0]?.id;
  if (!id) return;
  const filas = await (await fetch(
    `${base}/rest/v1/facturas?select=numero_erp&empresa_id=eq.${id}&order=fecha.desc&limit=5`,
    { headers },
  )).json();
  console.log(`  facturas.numero_erp (muestra): ${filas.map((f) => JSON.stringify(f.numero_erp)).join(', ')}`);
}

async function rpc(empresa, pares) {
  const res = await fetch(`${entorno.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/enlazar_fechas_pedido`, {
    method: 'POST',
    headers: {
      apikey: entorno.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${entorno.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_codigo_empresa: empresa, p_pares: pares }),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`enlazar_fechas_pedido: ${res.status} ${texto}`);
  return JSON.parse(texto || '{}');
}

async function main() {
  const desde = desdeFijo ?? entorno.PERIODO_START ?? '2021-01-01';
  const hasta = hastaFijo ?? iso(new Date());
  const empresas = a3.empresas.filter((e) => !soloEmpresa || e.codigo === soloEmpresa);
  console.log(`[enlace] ${desde} → ${hasta} · empresas: ${empresas.map((e) => e.codigo).join(', ')}`);

  const pool = await mssql.connect(conn);
  let totalPares = 0;
  let totalActualizadas = 0;

  try {
    for (const e of empresas) {
      console.log(`\n=== ${e.codigo} · ${e.base} ===`);
      await muestraFacturas(e.codigo);
      let mostrado = false;
      for (const t of tramosMensuales(desde, hasta)) {
        const filtro = a3.sqlFechasPedido.filtroFecha.replace('{desde}', t.desde).replace('{hasta}', t.hasta);
        const sql = a3.sqlFechasPedido.consulta.replace('{RANGO}', filtro).replaceAll('{base}', e.base);
        const filas = (await pool.request().query(sql)).recordset;
        const pares = filas
          .map((f) => ({
            factura_numero: String(f.FACTURA_NUMERO ?? '').trim(),
            factura_numero_alt: String(f.FACTURA_NUMDOC ?? '').trim(),
            pedido_fecha: fechaISODe(f.PEDIDO_FECHA),
            pedido_entrega: fechaISODe(f.PEDIDO_ENTREGA),
          }))
          .filter((p) => p.factura_numero !== '' && p.pedido_fecha !== '');
        if (pares.length === 0) continue;
        if (!mostrado) {
          console.log(`  ejemplo de par enviado: ${JSON.stringify(pares[0])}`);
          mostrado = true;
        }
        const res = await rpc(e.codigo, pares);
        totalPares += pares.length;
        totalActualizadas += Number(res.facturas_actualizadas ?? 0);
        console.log(`  ${t.desde} → ${t.hasta}: ${pares.length} pares · ${JSON.stringify(res)}`);
      }
    }
  } finally {
    await pool.close();
  }

  console.log(`\n[enlace] TOTAL: ${totalPares} pares enviados · ${totalActualizadas} facturas actualizadas`);
  if (totalPares > 0 && totalActualizadas === 0) {
    console.log('[enlace] AVISO: ningún número de factura ha casado. Revisa el formato de facturas.numero_erp.');
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
