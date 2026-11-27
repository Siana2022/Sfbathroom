/**
 * Importa de Zoho CRM a `public.interacciones`: llamadas y notas.
 *
 * - Idempotente: `origen='zoho'` + `id_externo` (id en Zoho); reejecutar actualiza,
 *   no duplica.
 * - Lo que no casa con ningún cliente entra con `cliente_id = null` y
 *   `pendiente = true`, para vincularlo a mano.
 * - Respeta los vínculos manuales: si una fila ya tiene cliente asignado a mano y el
 *   cruce automático no coincide, no se toca.
 * - Solo lee de Zoho (GET). Escribe únicamente en Supabase.
 *
 * El cruce de las notas va por su `Parent_Id`: casi todas cuelgan de una llamada, y
 * entonces heredan el cliente de esa llamada (vínculo exacto, sin heurística).
 *
 * Variables necesarias (.env del PC):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 *   ZOHO_DOMAIN=eu                      (eu | com)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   node --env-file=.env importar-llamadas.mjs --simular      (no escribe nada)
 *   node --env-file=.env importar-llamadas.mjs                (llamadas + notas)
 *   node --env-file=.env importar-llamadas.mjs --sin-notas    (solo llamadas)
 *
 * Requiere la migración 0095 aplicada en Supabase.
 */
import { writeFileSync } from 'node:fs';
import { crearCruce, idDe, apiNameDeModulo } from './lib/cruce.mjs';

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID ?? '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET ?? '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN ?? '';
const ZOHO_DOMAIN = (process.env.ZOHO_DOMAIN ?? 'eu').toLowerCase();
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const SIMULAR = process.argv.includes('--simular');
const SIN_NOTAS = process.argv.includes('--sin-notas');
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

/** Escribe las interacciones y deja el mapeo Zoho → fila local. */
async function escribir(filas, entidad) {
  if (filas.length === 0) return 0;
  const escritas = await upsert('interacciones', 'origen,id_externo', filas);
  const mapeo = escritas
    .filter((f) => f.id && f.id_externo)
    .map((f) => ({ origen: 'zoho', entidad, id_externo: f.id_externo, id_interno: f.id }));
  await upsert('mapeo_externo', 'origen,entidad,id_externo', mapeo);
  return escritas.length;
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
    leerTabla('interacciones', 'id,id_externo,cliente_id,empresa_id,comercial_id', 'origen=eq.zoho'),
  ]);

  const [cuentas, zContacts, llamadas, notas, eventos] = await Promise.all([
    zohoAll(token, 'Accounts', 'id,Account_Name'),
    zohoAll(token, 'Contacts', 'id,Full_Name,Email,Account_Name,Account_Name.id'),
    zohoAll(token, 'Calls', 'id,Subject,Call_Start_Time,Call_Duration,Description,Call_Result,Who_Id,What_Id,Owner'),
    SIN_NOTAS
      ? Promise.resolve([])
      : zohoAll(token, 'Notes', 'id,Note_Title,Note_Content,Parent_Id,Created_Time,Owner'),
    SIN_NOTAS ? Promise.resolve([]) : zohoAll(token, 'Events', 'id,Event_Title,Who_Id,What_Id'),
  ]);

  const cruce = crearCruce({ clientes, contactos });
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c.Account_Name]));
  const zContactoPorId = new Map(zContacts.map((c) => [c.id, c]));
  const llamadaPorId = new Map(llamadas.map((l) => [l.id, l]));
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const comercialPorEmail = new Map(
    comerciales.filter((c) => c.email).map((c) => [String(c.email).trim().toLowerCase(), c]),
  );
  // id_externo → fila ya importada (para no pisar vínculos manuales).
  const yaImportadas = new Map(existentes.filter((e) => e.id_externo).map((e) => [e.id_externo, e]));

  const filasLlamadas = [];
  const filasNotas = [];
  const pendientes = [];
  const porViaLlamadas = {};
  const porViaNotas = {};
  const porModuloNotas = { Accounts: 0, Contacts: 0, Calls: 0, Events: 0, otros: 0, sinPadre: 0 };
  let saltadasSinFecha = 0;
  let respetadosVinculosManuales = 0;

  /** ¿Esta fila ya estaba vinculada a mano a otro cliente? */
  function vinculoManualChoca(idExterno, cliente) {
    const previa = yaImportadas.get(idExterno);
    if (previa?.cliente_id && previa.cliente_id !== (cliente?.id ?? null)) {
      respetadosVinculosManuales += 1;
      return true;
    }
    return false;
  }

  /**
   * Si el padre (llamada o visita) ya está vinculado a mano en la base de datos,
   * la nota hereda ese cliente: así se casan las notas de llamadas que se
   * corrigieron en la pantalla de pendientes.
   */
  function clienteDePadreVinculado(parentId) {
    const previa = parentId ? yaImportadas.get(parentId) : null;
    if (!previa?.cliente_id) return null;
    const cliente = cruce.clientePorId.get(previa.cliente_id) ?? null;
    return cliente ? { cliente, via: 'nota-padre-vinculado', contacto: null } : null;
  }

  function comercialDe(registro, cliente) {
    const ownerEmail = (registro.Owner?.email ?? '').toString().trim().toLowerCase();
    return cliente?.comercial_id ?? comercialPorEmail.get(ownerEmail)?.id ?? null;
  }

  for (const llamada of llamadas) {
    const idExterno = idDe(llamada);
    const fecha = iso(llamada.Call_Start_Time);
    if (!idExterno || !fecha) {
      saltadasSinFecha += 1;
      continue;
    }

    const { cliente, via } = cruce.resolverLlamada(llamada, cuentaPorId, zContactoPorId);
    if (vinculoManualChoca(idExterno, cliente)) continue;

    if (cliente) porViaLlamadas[via] = (porViaLlamadas[via] ?? 0) + 1;
    else {
      pendientes.push({
        tipo: 'llamada',
        id_externo: idExterno,
        fecha,
        asunto: llamada.Subject ?? null,
        contacto: llamada.Who_Id?.name ?? null,
        cuenta: llamada.What_Id?.name ?? null,
      });
    }

    // Columnas de la tabla existente (0037): asunto/contenido/duracion_min.
    filasLlamadas.push({
      empresa_id: cliente?.empresa_id ?? null,
      cliente_id: cliente?.id ?? null,
      comercial_id: comercialDe(llamada, cliente),
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

  for (const nota of notas) {
    const idExterno = idDe(nota);
    const fecha = iso(nota.Created_Time);
    if (!idExterno || !fecha) {
      saltadasSinFecha += 1;
      continue;
    }

    const parentId = idDe(nota.Parent_Id);
    const modulo = apiNameDeModulo(nota.$se_module) ?? apiNameDeModulo(nota.Parent_Id?.module);
    if (!parentId) porModuloNotas.sinPadre += 1;
    else if (modulo && modulo in porModuloNotas) porModuloNotas[modulo] += 1;
    else porModuloNotas.otros += 1;

    let resuelto = cruce.resolverNota(nota, cuentaPorId, zContactoPorId, llamadaPorId, eventoPorId);
    if (!resuelto.cliente) resuelto = clienteDePadreVinculado(parentId) ?? resuelto;
    const { cliente, via } = resuelto;
    if (vinculoManualChoca(idExterno, cliente)) continue;

    if (cliente) porViaNotas[via] = (porViaNotas[via] ?? 0) + 1;
    else {
      pendientes.push({
        tipo: 'nota',
        id_externo: idExterno,
        fecha,
        asunto: nota.Note_Title ?? null,
        padre: nota.Parent_Id?.name ?? null,
        modulo: modulo ?? null,
      });
    }

    filasNotas.push({
      empresa_id: cliente?.empresa_id ?? null,
      cliente_id: cliente?.id ?? null,
      comercial_id: comercialDe(nota, cliente),
      tipo: 'nota',
      fecha,
      asunto: nota.Note_Title ?? '(nota de Zoho)',
      contenido: nota.Note_Content ?? '',
      resultado: null,
      duracion_min: null,
      pendiente: !cliente,
      origen: 'zoho',
      id_externo: idExterno,
      updated_at: new Date().toISOString(),
    });
  }

  const resumen = {
    generado: new Date().toISOString(),
    simulado: SIMULAR,
    llamadas: {
      zoho: llamadas.length,
      preparadas: filasLlamadas.length,
      casan: filasLlamadas.filter((f) => f.cliente_id).length,
      porVia: porViaLlamadas,
    },
    notas: {
      zoho: notas.length,
      preparadas: filasNotas.length,
      casan: filasNotas.filter((f) => f.cliente_id).length,
      porVia: porViaNotas,
      porModuloPadre: porModuloNotas,
    },
    pendientes: pendientes.length,
    saltadasSinFecha,
    respetadosVinculosManuales,
  };

  if (SIMULAR) {
    console.log('SIMULACIÓN (no se escribe nada)');
    console.log(JSON.stringify(resumen, null, 2));
    console.log('Pendientes:', pendientes.slice(0, 10));
    writeFileSync('informe-importacion-llamadas.json', JSON.stringify({ ...resumen, pendientes }, null, 2));
    return;
  }

  resumen.escritasLlamadas = await escribir(filasLlamadas, 'call');
  resumen.escritasNotas = await escribir(filasNotas, 'note');

  console.log(JSON.stringify(resumen, null, 2));
  console.log(
    `Escritas: ${resumen.escritasLlamadas} llamadas + ${resumen.escritasNotas} notas · pendientes: ${pendientes.length}`,
  );
  writeFileSync('informe-importacion-llamadas.json', JSON.stringify({ ...resumen, pendientes }, null, 2));
  console.log('Informe en informe-importacion-llamadas.json');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
