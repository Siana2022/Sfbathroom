/**
 * Carga condiciones de pago, tarifa y riesgo del cliente desde A3ERP (__CLIENTES).
 *
 * Uso (en el PC de la ingesta, con su .env):
 *   node --env-file=.env vuelo-clientes-credito.mjs
 *   node --env-file=.env vuelo-clientes-credito.mjs --empresa SF
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
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

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

      const formas = (await pool.request().query(`SELECT TOP 500 * FROM ${base}.dbo.FORMAPAGCLI`)).recordset;
      const mapaFormas = new Map();
      for (const f of formas) {
        const claves = Object.keys(f);
        const colCod = claves.find((c) => /FORPAG|CODPAG|DOCPAG/i.test(c));
        const colNom = claves.find((c) => /DESC|NOMBRE/i.test(c));
        if (colCod && colNom) {
          const valor = limpio(f[colCod]);
          if (valor) mapaFormas.set(valor.toUpperCase(), limpio(f[colNom]));
        }
      }

      const filas = (
        await pool.request().query(`
          SELECT CODCLI, FORPAG, DOCPAG, TARIFA, DIASPAGO1, RIESGOCON, SUPRIESGO
          FROM ${base}.dbo.[__CLIENTES]
        `)
      ).recordset;

      const registros = [];
      for (const c of filas) {
        const codigo = limpio(c.CODCLI);
        if (!codigo) continue;
        const formaCodigo = limpio(c.FORPAG);
        registros.push({
          codigo,
          forma_pago: formaCodigo ? (mapaFormas.get(formaCodigo.toUpperCase()) ?? formaCodigo) : null,
          forma_pago_codigo: formaCodigo,
          documento_pago: limpio(c.DOCPAG),
          tarifa_codigo: limpio(c.TARIFA),
          dias_pago: num(c.DIASPAGO1) === null ? null : Math.round(Number(c.DIASPAGO1)),
          riesgo_concedido: num(c.RIESGOCON),
          riesgo_actual: num(c.SUPRIESGO),
        });
      }

      console.log(`${e.codigo}: ${registros.length} clientes · ${mapaFormas.size} formas de pago mapeadas`);
      let actualizados = 0;
      for (let i = 0; i < registros.length; i += LOTE) {
        const r = await rpc('actualizar_clientes_credito', {
          p_codigo_empresa: e.codigo,
          p_filas: registros.slice(i, i + LOTE),
        });
        actualizados += Number(r?.actualizados ?? 0);
      }
      console.log(`  actualizados ${actualizados}`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
