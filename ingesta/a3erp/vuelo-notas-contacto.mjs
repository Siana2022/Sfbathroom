/**
 * Carga las anotaciones de las personas de contacto de A3ERP como notas del cliente.
 *
 * A3ERP las guarda en `ContactosSeleccionClientes`, que no lleva el código de cliente.
 * El vínculo se resuelve por **email**: se busca ese email en `ClientesContactos`
 * (la ficha del cliente con su contacto principal) y de ahí sale el CODCLI.
 *
 * Se guardan en `interacciones` (tipo nota), así aparecen en el historial de la ficha
 * sin necesidad de importar antes el modelo de contactos.
 *
 * Uso:
 *   node --env-file=.env vuelo-notas-contacto.mjs
 *   node --env-file=.env vuelo-notas-contacto.mjs --simular
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
const SIMULAR = process.argv.includes('--simular');

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
const limpio = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const normEmail = (v) => (v ?? '').toString().trim().toLowerCase();

async function leer(tabla, campos, filtro = '') {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const res = await fetch(`${SUPABASE}/rest/v1/${tabla}?select=${campos}${filtro}&limit=1000&offset=${desde}`, {
      headers: CABECERAS,
    });
    if (!res.ok) throw new Error(`${tabla} ${res.status}: ${await res.text()}`);
    const lote = await res.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return filas;
}

async function upsert(filas) {
  if (filas.length === 0) return 0;
  const res = await fetch(`${SUPABASE}/rest/v1/interacciones?on_conflict=origen,id_externo&select=id`, {
    method: 'POST',
    headers: { ...CABECERAS, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`interacciones ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return (await res.json()).length;
}

const pool = await mssql.connect({
  server: entorno.MSSQL_HOST,
  port: Number(entorno.MSSQL_PORT || '1433'),
  user: entorno.MSSQL_USER,
  password: entorno.MSSQL_PASSWORD,
  options: { encrypt: entorno.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
});

try {
  const empresas = (await leer('empresas', 'id,codigo')).reduce((m, e) => ({ ...m, [e.codigo]: e.id }), {});
  let total = 0;

  for (const e of a3.empresas) {
    const base = `[${e.base}]`;

    const contactos = (
      await pool.request().query(`SELECT CODCLI, ContactoEmail, E_MAIL FROM ${base}.dbo.ClientesContactos`)
    ).recordset;

    // email → cliente (el del contacto manda; el general de la empresa como respaldo)
    const clientePorEmail = new Map();
    for (const c of contactos) {
      const codigo = limpio(c.CODCLI);
      if (!codigo) continue;
      const e1 = normEmail(c.ContactoEmail);
      const e2 = normEmail(c.E_MAIL);
      if (e1 && !clientePorEmail.has(e1)) clientePorEmail.set(e1, codigo);
      if (e2 && !clientePorEmail.has(e2)) clientePorEmail.set(e2, codigo);
    }

    const filas = (
      await pool
        .request()
        .query(`SELECT IDCONTACTO, NOMBRE, EMAIL, CARGO, OBSERVACIONES FROM ${base}.dbo.ContactosSeleccionClientes
                WHERE OBSERVACIONES IS NOT NULL`)
    ).recordset.filter((c) => String(c.OBSERVACIONES ?? '').trim() !== '');

    console.log(`\n${e.codigo}: ${filas.length} notas de contacto · ${clientePorEmail.size} emails en la ficha de cliente`);

    const clientes = await leer('clientes', 'id,codigo_erp,empresa_id,comercial_id', `&empresa_id=eq.${empresas[e.codigo]}`);
    const porCodigo = new Map(clientes.filter((c) => c.codigo_erp).map((c) => [String(c.codigo_erp).trim(), c]));

    const registros = [];
    let sinCliente = 0;
    for (const c of filas) {
      const codigo = clientePorEmail.get(normEmail(c.EMAIL));
      const cliente = codigo ? porCodigo.get(String(codigo).trim()) : null;
      if (!cliente) {
        sinCliente += 1;
        continue;
      }
      registros.push({
        empresa_id: cliente.empresa_id,
        cliente_id: cliente.id,
        comercial_id: cliente.comercial_id ?? null,
        tipo: 'nota',
        fecha: new Date().toISOString(),
        asunto: `Contacto: ${limpio(c.NOMBRE) ?? 'sin nombre'}${limpio(c.CARGO) ? ` (${limpio(c.CARGO)})` : ''}`,
        contenido: String(c.OBSERVACIONES).trim(),
        origen: 'a3erp',
        id_externo: `contacto:${e.codigo}:${c.IDCONTACTO}`,
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`  casadas ${registros.length} · sin cliente ${sinCliente}`);
    total += registros.length;

    if (SIMULAR) continue;
    const escritas = await upsert(registros);
    console.log(`  escritas ${escritas}`);
  }

  console.log(`\nTotal casadas: ${total}${SIMULAR ? ' (simulación, no se ha escrito nada)' : ''}`);
} finally {
  await pool.close();
}
