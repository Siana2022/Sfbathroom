/**
 * Enlaza cada factura con su pedido (fechas) sin recargar ventas.
 *
 * No depende del formato de `facturas.numero_erp`: descarga los números reales
 * de Supabase, empareja en memoria y llama a `enlazar_fechas_pedido_por_id`
 * (migración 0049) con el uuid de cada factura.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env enlazar-pedidos.mjs
 *   node --env-file=.env enlazar-pedidos.mjs --empresa SF
 *   node --env-file=.env enlazar-pedidos.mjs --desde 2025-01-01 --hasta 2026-12-31
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
  console.error('Faltan variables: ejecuta con el .env de la ingesta.');
  process.exit(1);
}

const SUPABASE = entorno.SUPABASE_URL.replace(/\/$/, '');
const CABECERAS_SUPA = {
  apikey: entorno.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${entorno.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

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

const norm = (v) => String(v ?? '').trim();
const digitos = (v) => norm(v).replace(/\D/g, '');

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

async function getSupabase(ruta) {
  const res = await fetch(`${SUPABASE}/rest/v1/${ruta}`, { headers: CABECERAS_SUPA });
  if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Mapa número de factura → uuid, tolerante a espacios y formatos. */
async function indiceFacturas(empresaId) {
  const porNumero = new Map();
  const porDigitos = new Map();
  for (let desde = 0; ; desde += 1000) {
    const filas = await getSupabase(
      `facturas?select=id,numero_erp&empresa_id=eq.${empresaId}&order=numero_erp&limit=1000&offset=${desde}`,
    );
    for (const f of filas) {
      const n = norm(f.numero_erp);
      if (!n) continue;
      if (!porNumero.has(n)) porNumero.set(n, f.id);
      const d = digitos(n);
      if (d && !porDigitos.has(d)) porDigitos.set(d, f.id);
    }
    if (filas.length < 1000) break;
  }
  return { porNumero, porDigitos, total: porNumero.size };
}

function resolver(par, indice) {
  const compuesto = norm(par.factura_numero);
  const simple = norm(par.factura_numero_alt);
  return (
    indice.porNumero.get(compuesto) ??
    indice.porNumero.get(simple) ??
    indice.porDigitos.get(digitos(compuesto)) ??
    indice.porDigitos.get(digitos(simple)) ??
    null
  );
}


/** Mapa número de pedido → uuid. El número simple solo se usa si es único. */
async function indicePedidos(empresaId) {
  const compuestos = new Map();
  const porNumero = new Map();
  const repetidos = new Set();
  const muestra = [];
  for (let desde = 0; ; desde += 1000) {
    const filas = await getSupabase(
      `pedidos?select=id,serie,numero_erp&empresa_id=eq.${empresaId}&order=numero_erp&limit=1000&offset=${desde}`,
    );
    for (const p of filas) {
      const num = norm(p.numero_erp);
      const serie = norm(p.serie);
      if (!num) continue;
      if (muestra.length < 5) muestra.push(`${serie}|${num}`);
      if (serie) compuestos.set(`${serie}-${num}`, p.id);
      if (porNumero.has(num)) repetidos.add(num);
      else porNumero.set(num, p.id);
    }
    if (filas.length < 1000) break;
  }
  const mapa = new Map(compuestos);
  for (const [num, id] of porNumero) {
    if (!repetidos.has(num) && !mapa.has(num)) mapa.set(num, id);
  }
  return { mapa, muestra };
}

async function rpcEntregaPedidos(pares) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/actualizar_entrega_pedidos`, {
    method: 'POST',
    headers: CABECERAS_SUPA,
    body: JSON.stringify({ p_pares: pares }),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`actualizar_entrega_pedidos: ${res.status} ${texto}`);
  return JSON.parse(texto || '{}');
}

/** Copia CABEPEDV.FECENTREGA a pedidos.fecha_prometida. */
async function sincronizarPedidos(e, empresaId, pool) {
  const { mapa: indice, muestra } = await indicePedidos(empresaId);
  const sql = `SELECT LTRIM(RTRIM(SERIE)) + '-' + CAST(CAST(NUMDOC AS bigint) AS varchar(20)) AS COMPUESTO,
                      CAST(CAST(NUMDOC AS bigint) AS varchar(20)) AS NUMERO,
                      CONVERT(varchar(10), FECENTREGA, 120) AS ENTREGA
               FROM [${e.base}].dbo.CABEPEDV`;
  const filas = (await pool.request().query(sql)).recordset;

  const pares = [];
  const sinCasar = [];
  let conEntrega = 0;
  let sinEntrega = 0;
  for (const f of filas) {
    const compuesto = norm(f.COMPUESTO);
    const numero = norm(f.NUMERO);
    const entrega = norm(f.ENTREGA);
    if (!entrega) { sinEntrega += 1; continue; }
    conEntrega += 1;
    const id = indice.get(compuesto) ?? indice.get(numero) ?? null;
    if (id) pares.push({ pedido_id: id, fecha_prometida: entrega });
    else if (sinCasar.length < 5) sinCasar.push(`${compuesto} / ${numero}`);
  }

  let actualizados = 0;
  for (let i = 0; i < pares.length; i += 500) {
    const res = await rpcEntregaPedidos(pares.slice(i, i + 500));
    actualizados += Number(res.pedidos_actualizados ?? 0);
  }
  console.log(
    `  pedidos: ${filas.length} en ERP · ${conEntrega} con FECENTREGA · ${sinEntrega} sin fecha · ${pares.length} emparejados · ${actualizados} actualizados`,
  );
  if (sinCasar.length) console.log(`  pedidos sin emparejar (muestra): ${sinCasar.join(' · ')}`);
  if (muestra.length) console.log(`  claves en Supabase (muestra): ${muestra.join(' · ')}`);
}

async function rpcPorId(pares) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/enlazar_fechas_pedido_por_id`, {
    method: 'POST',
    headers: CABECERAS_SUPA,
    body: JSON.stringify({ p_pares: pares }),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`enlazar_pedido_por_id: ${res.status} ${texto}`);
  return JSON.parse(texto || '{}');
}

async function main() {
  const desde = desdeFijo ?? entorno.PERIODO_START ?? '2021-01-01';
  const hasta = hastaFijo ?? iso(new Date());
  const empresas = a3.empresas.filter((e) => !soloEmpresa || e.codigo === soloEmpresa);
  console.log(`[enlace] ${desde} → ${hasta} · empresas: ${empresas.map((e) => e.codigo).join(', ')}`);

  const empresasSupabase = await getSupabase('empresas?select=id,codigo');
  const idDe = new Map(empresasSupabase.map((e) => [e.codigo, e.id]));

  const pool = await mssql.connect(conn);
  let totalPares = 0;
  let totalResueltos = 0;
  let totalActualizadas = 0;
  let sinResolverMostrados = 0;

  try {
    for (const e of empresas) {
      const empresaId = idDe.get(e.codigo);
      if (!empresaId) {
        console.log(`\n=== ${e.codigo} === sin empresa en Supabase, se omite`);
        continue;
      }

      const indice = await indiceFacturas(empresaId);
      console.log(`\n=== ${e.codigo} · ${e.base} === facturas con número: ${indice.total}`);

      let mostrado = false;
      for (const t of tramosMensuales(desde, hasta)) {
        const filtro = a3.sqlFechasPedido.filtroFecha.replace('{desde}', t.desde).replace('{hasta}', t.hasta);
        const sql = a3.sqlFechasPedido.consulta.replace('{RANGO}', filtro).replaceAll('{base}', e.base);
        const filas = (await pool.request().query(sql)).recordset;

        const pares = filas
          .map((f) => ({
            factura_numero: norm(f.FACTURA_NUMERO),
            factura_numero_alt: norm(f.FACTURA_NUMDOC),
            pedido_fecha: fechaISODe(f.PEDIDO_FECHA),
            pedido_entrega: fechaISODe(f.PEDIDO_ENTREGA),
          }))
          .filter((p) => p.factura_numero !== '' && p.pedido_fecha !== '');
        if (pares.length === 0) continue;

        if (!mostrado) {
          const muestra = (await getSupabase(`facturas?select=numero_erp&empresa_id=eq.${empresaId}&limit=5&order=fecha.desc`))
            .map((f) => JSON.stringify(f.numero_erp))
            .join(', ');
          console.log(`  facturas.numero_erp (muestra): ${muestra}`);
          console.log(`  ejemplo de par: ${JSON.stringify(pares[0])}`);
          mostrado = true;
        }

        const conId = [];
        for (const p of pares) {
          const id = resolver(p, indice);
          if (id) conId.push({ factura_id: id, pedido_fecha: p.pedido_fecha, pedido_entrega: p.pedido_entrega });
          else if (sinResolverMostrados < 5) {
            console.log(`  sin emparejar: ${JSON.stringify(p.factura_numero)} / ${JSON.stringify(p.factura_numero_alt)}`);
            sinResolverMostrados += 1;
          }
        }

        totalPares += pares.length;
        totalResueltos += conId.length;
        if (conId.length === 0) continue;

        for (let i = 0; i < conId.length; i += 500) {
          const lote = conId.slice(i, i + 500);
          const res = await rpcPorId(lote);
          totalActualizadas += Number(res.facturas_actualizadas ?? 0);
        }
        console.log(`  ${t.desde} → ${t.hasta}: ${pares.length} pares · ${conId.length} emparejados`);
      }

      await sincronizarPedidos(e, empresaId, pool);
    }
  } finally {
    await pool.close();
  }

  console.log(`\n[enlace] TOTAL: ${totalPares} pares · ${totalResueltos} emparejados · ${totalActualizadas} facturas actualizadas`);
  if (totalPares > 0 && totalResueltos === 0) {
    console.log('[enlace] AVISO: ningún número ha casado. Pásame las líneas "muestra" y "sin emparejar".');
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
