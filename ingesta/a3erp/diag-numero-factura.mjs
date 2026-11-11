/**
 * Diagnóstico: ¿cómo se guarda el número de factura en Supabase?
 *
 * Compara una muestra de public.facturas.numero_erp con las facturas reales de
 * A3ERP (CABEFACV.SERIE + NUMDOC) del mismo día y prueba varias fórmulas para
 * ver cuál coincide. Solo lectura: no modifica nada.
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env diag-numero-factura.mjs
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
const CAB = {
  apikey: entorno.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${entorno.SUPABASE_SERVICE_ROLE_KEY}`,
};
const conn = {
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
};

const norm = (v) => String(v ?? '').trim();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function getSupabase(ruta) {
  const res = await fetch(`${SUPABASE}/rest/v1/${ruta}`, { headers: CAB });
  if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Fórmulas candidatas a partir de una factura del ERP. */
function candidatos(serie, numdoc) {
  const s = norm(serie);
  const n = norm(numdoc);
  const nSinCeros = n.replace(/^0+/, '');
  return [
    `${s}-${n}`,
    n,
    `${s}${n}`,
    `${n}-${s}`,
    `${s}/${n}`,
    `${s}-${nSinCeros}`,
    `${s}${nSinCeros}`,
    nSinCeros,
  ];
}

async function main() {
  const empresasSupabase = await getSupabase('empresas?select=id,codigo');
  const idDe = new Map(empresasSupabase.map((e) => [e.codigo, e.id]));

  const pool = await mssql.connect(conn);
  try {
    for (const e of a3.empresas) {
      const empresaId = idDe.get(e.codigo);
      if (!empresaId) continue;
      console.log(`\n================ ${e.codigo} · ${e.base} ================`);

      // 1) Muestra de Supabase
      const muestra = (
        await getSupabase(
          `facturas?select=numero_erp,fecha&empresa_id=eq.${empresaId}&order=fecha.desc&limit=8`,
        )
      ).map((f) => ({ numero: norm(f.numero_erp), fecha: String(f.fecha).slice(0, 10) }));
      if (muestra.length === 0) {
        console.log('  (sin facturas en Supabase)');
        continue;
      }
      console.log('  Supabase:');
      for (const m of muestra) console.log(`    ${JSON.stringify(m.numero)}  ·  ${m.fecha}`);

      // 2) Facturas del ERP en el rango de esas fechas
      const desde = muestra[muestra.length - 1].fecha;
      const hasta = muestra[0].fecha;
      const erp = (
        await pool.request().query(
          `SELECT DISTINCT LTRIM(RTRIM(SERIE)) AS SERIE, CAST(NUMDOC AS varchar(20)) AS NUMDOC,
                  CONVERT(varchar(10), FECHA, 120) AS FECHA
           FROM [${e.base}].dbo.CABEFACV
           WHERE FECHA >= '${desde}' AND FECHA <= '${hasta}'
           ORDER BY FECHA DESC, NUMDOC DESC`,
        )
      ).recordset;

      console.log(`  A3ERP (${desde} → ${hasta}): ${erp.length} facturas`);
      for (const r of erp.slice(0, 8)) {
        console.log(`    SERIE=${JSON.stringify(norm(r.SERIE))} NUMDOC=${JSON.stringify(norm(r.NUMDOC))} · ${r.FECHA}`);
      }

      // 3) ¿Qué fórmula reproduce el número de Supabase?
      const porFecha = new Map();
      for (const r of erp) {
        const f = String(r.FECHA).slice(0, 10);
        if (!porFecha.has(f)) porFecha.set(f, []);
        porFecha.get(f).push(r);
      }

      const aciertos = new Map();
      for (const m of muestra) {
        const filas = porFecha.get(m.fecha) ?? erp;
        for (const r of filas) {
          candidatos(r.SERIE, r.NUMDOC).forEach((c, i) => {
            if (c === m.numero) aciertos.set(i, (aciertos.get(i) ?? 0) + 1);
          });
        }
      }

      const nombres = [
        'SERIE-NUMDOC',
        'NUMDOC',
        'SERIENUMDOC',
        'NUMDOC-SERIE',
        'SERIE/NUMDOC',
        'SERIE-NUMDOC(sin ceros)',
        'SERIENUMDOC(sin ceros)',
        'NUMDOC(sin ceros)',
      ];
      console.log('  Coincidencias por fórmula:');
      nombres.forEach((n, i) => console.log(`    ${n}: ${aciertos.get(i) ?? 0}/${muestra.length}`));

      const mejor = [...aciertos.entries()].sort((a, b) => b[1] - a[1])[0];
      if (mejor && mejor[1] > 0) {
        console.log(`  => El formato guardado parece: ${nombres[mejor[0]]}`);
      } else {
        console.log('  => Ninguna fórmula coincide: el número guardado no sale de SERIE/NUMDOC.');
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
