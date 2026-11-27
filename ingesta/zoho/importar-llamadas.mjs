/**
 * Importa las llamadas de Zoho CRM a `public.interacciones`.
 *
 * - Idempotente: `origen='zoho'` + `id_externo` (id de la llamada en Zoho); reejecutar
 *   actualiza, no duplica.
 * - Las llamadas que no casan con ningún cliente entran con `cliente_id = null` y
 *   `pendiente = true`, para vincularlas a mano.
 * - Respeta los vínculos manuales: si una interacción ya tiene cliente asignado a mano
 *   y el cruce automático no coincide, no se toca.
 * - Solo lee de Zoho (GET). Escribe únicamente en Supabase.
 *
 * Variables necesarias (.env del PC):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 *   ZOHO_DOMAIN=eu                      (eu | com)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   node --env-file=.env ingesta/zoho/importar-llamadas.mjs --simular   (no escribe nada)
 *   node --env-file=.env ingesta/zoho/importar-llamadas.mjs
 *
 * Requiere la migración 0095_interacciones_zoho.sql aplicada en Supabase.
 */
import { writeFileSync } from 'node:fs';
import { crearCruce, idDe } from './lib/cruce.mjs';

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID ?? '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET ?? '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN ?? '';
const ZOHO_DOMAIN = (process.env.ZOHO_DOMAIN ?? 'eu').toLowerCase();
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const SIMULAR = process.argv.includes('--simular');
const LOTE = 100;

if (!ZOHO_REFRESH_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan variables: ZOHO_REFRESH_TOKEN, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

async function tokenZoho() {
  const res = await fetch(`https://accounts.zoho.${ZOHO_DOMAIN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Zoho: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function zohoAll(token, modulo, fields) {
  const filas = [];
  let page = 1;
  for (;;) {
    const url = `https://www.zohoapis.${ZOHO_DOMAIN}/crm/v8/${modulo}?per_page=200&page=${page}&fields=${fields}`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`${modulo} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    filas.push(...(data.data ?? []));
    if (!data.info?.more_records) break;
    page += 1;
    if (page > 50) break;
  }
  return filas;
}

const cabecerasSupabase = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function leerTabla(tabla, campos, filtro = '') {
  const filas = [];
  let desde = 0;
  for (;;) {
    const qs = `select=${campos}${filtro ? `&${filtro}` : ''}&limit=1000&offset=${desde}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${qs}`, {
      headers: cabecerasSupabase,
    });
    if (!res.ok) throw new Error(`${tabla} ${res.status}: ${await res.text()}`);
    const lote = await res.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
    desde += 1000;
  }
  return filas;
}

/** Upsert por lotes con PostgREST. Devuelve las filas escritas. */
async function upsert(tabla, onConflict, filas) {
  const escritas = [];
  for (let i = 0; i < filas.length; i += LOTE) {
    const trozo = filas.slice(i, i + LOTE);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?on_conflict=${onConflict}&select=*`, {
      method: 'POST',
      headers: {
        ...cabecerasSupabase,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(trozo),
    });
    if (!res.ok) throw new Error(`${tabla} upsert ${res.status}: ${(await res.text()).slice(0, 500)}`);
    escritas.push(...(await res.json()));
  }
  return escritas;
}

/** Zoho ya devuelve la duración en minutos. */
function duracionMinutos(valor) {
  const minutos = Number(valor);
  if (!Number.isFinite(minutos) || minutos <= 0) return null;
  return Math.round(minutos);
}

function iso(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function main() {
  const token = await tokenZoho();

  const [clientes, contactos, comerciales, existentes] = await Promise.all([
    leerTabla('clientes', 'id,nombre,cif,empresa_id,comercial_id'),
    leerTabla('clientes_contactos', 'id,nombre,email,cliente_id'),
    leerTabla('comerciales', 'id,nombre,email'),
    leerTabla('interacciones', 'id,id_externo,cliente_id', 'origen=eq.zoho'),
  ]);

  const [cuentas, zContacts, llamadas] = await Promise.all([
    zohoAll(token, 'Accounts', 'id,Account_Name'),
    zohoAll(token, 'Contacts', 'id,Full_Name,Email,Account_Name,Account_Name.id'),
    zohoAll(token, 'Calls', 'id,Subject,Call_Start_Time,Call_Duration,Description,Call_Result,Who_Id,What_Id,Owner'),
  ]);

  const cruce = crearCruce({ clientes, contactos });
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c.Account_Name]));
  const zContactoPorId = new Map(zContacts.map((c) => [c.id, c]));
  const comercialPorEmail = new Map(
    comerciales.filter((c) => c.email).map((c) => [String(c.email).trim().toLowerCase(), c]),
  );
  // id_externo → fila ya importada (para no pisar vínculos manuales).
  const yaImportadas = new Map(existentes.filter((e) => e.id_externo).map((e) => [e.id_externo, e]));

  const filas = [];
  const pendientes = [];
  const porVia = {};
  let sinFecha = 0;
  let conVinculoManual = 0;

  for (const llamada of llamadas) {
    const idExterno = idDe(llamada);
    const fecha = iso(llamada.Call_Start_Time);
    if (!idExterno || !fecha) {
      sinFecha += 1;
      continue;
    }

    const { cliente, via } = cruce.resolverLlamada(llamada, cuentaPorId, zContactoPorId);

    // No pisar lo que se haya vinculado a mano en la pantalla de pendientes.
    const previa = yaImportadas.get(idExterno);
    if (previa?.cliente_id && previa.cliente_id !== (cliente?.id ?? null)) {
      conVinculoManual += 1;
      continue;
    }

    const ownerEmail = (llamada.Owner?.email ?? '').toString().trim().toLowerCase();
    const comercial = cliente?.comercial_id ?? comercialPorEmail.get(ownerEmail)?.id ?? null;

    if (cliente) porVia[via] = (porVia[via] ?? 0) + 1;
    else {
      pendientes.push({
        id_externo: idExterno,
        fecha,
        asunto: llamada.Subject ?? null,
        contacto: llamada.Who_Id?.name ?? null,
        cuenta: llamada.What_Id?.name ?? null,
      });
    }

    // Columnas de la tabla existente (0037): asunto/contenido/duracion_min.
    filas.push({
      empresa_id: cliente?.empresa_id ?? null,
      cliente_id: cliente?.id ?? null,
      comercial_id: comercial,
      tipo: 'llamada',
      fecha,
      asunto: llamada.Subject ?? null,
      contenido: llamada.Description ?? llamada.Subject ?? '',
      resultado: llamada.Call_Result ?? null,
      duracion_min: duracionMinutos(llamada.Call_Duration),
      pendiente: !cliente,
      origen: 'zoho',
      id_externo: idExterno,
      updated_at: new Date().toISOString(),
    });
  }

  const resumen = {
    generado: new Date().toISOString(),
    simulado: SIMULAR,
    llamadasZoho: llamadas.length,
    preparadas: filas.length,
    casan: filas.filter((f) => f.cliente_id).length,
    pendientes: pendientes.length,
    porVia,
    saltadasSinFecha: sinFecha,
    respetadosVinculosManuales: conVinculoManual,
  };

  if (SIMULAR) {
    console.log('SIMULACIÓN (no se escribe nada)');
    console.log(JSON.stringify(resumen, null, 2));
    console.log('Pendientes:', pendientes.slice(0, 10));
    writeFileSync('informe-importacion-llamadas.json', JSON.stringify({ ...resumen, pendientes }, null, 2));
    return;
  }

  const escritas = await upsert('interacciones', 'origen,id_externo', filas);

  // Trazabilidad Zoho → fila local (y base para importar después notas y reuniones).
  const mapeo = escritas
    .filter((f) => f.id_externo && f.id)
    .map((f) => ({ origen: 'zoho', entidad: 'call', id_externo: f.id_externo, id_interno: f.id }));
  await upsert('mapeo_externo', 'origen,entidad,id_externo', mapeo);

  resumen.escritas = escritas.length;
  console.log(JSON.stringify(resumen, null, 2));
  console.log('Interacciones escritas:', escritas.length, '· pendientes:', pendientes.length);
  writeFileSync('informe-importacion-llamadas.json', JSON.stringify({ ...resumen, pendientes }, null, 2));
  console.log('Informe en informe-importacion-llamadas.json');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
