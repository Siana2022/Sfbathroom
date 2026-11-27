/**
 * Simulación de importación de Zoho CRM (solo lectura, no escribe nada).
 *
 * Lee llamadas y notas de Zoho, las cruza con los clientes de las tres empresas
 * y genera un informe de coincidencias. El cruce vive en `lib/cruce.mjs`, que es
 * el mismo que usa el importador real.
 *
 * Variables necesarias (.env):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 *   ZOHO_DOMAIN=eu                      (eu | com)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: node --env-file=.env ingesta/zoho/simular-importacion.mjs
 */
import { writeFileSync } from 'node:fs';
import { crearCruce, idDe, apiNameDeModulo } from './lib/cruce.mjs';

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID ?? '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET ?? '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN ?? '';
const ZOHO_DOMAIN = (process.env.ZOHO_DOMAIN ?? 'eu').toLowerCase();
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

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
    const lote = data.data ?? [];
    filas.push(...lote);
    if (!data.info?.more_records) break;
    page += 1;
    if (page > 50) break;
  }
  return filas;
}

async function supabase(tabla, campos) {
  const filas = [];
  let desde = 0;
  for (;;) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?select=${campos}&limit=1000&offset=${desde}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`${tabla} ${res.status}: ${await res.text()}`);
    const lote = await res.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
    desde += 1000;
  }
  return filas;
}

async function main() {
  const token = await tokenZoho();
  const [clientes, contactos, cuentas, zContacts, llamadas, notas, eventos] = await Promise.all([
    supabase('clientes', 'id,nombre,cif,empresa_id,comercial_id'),
    supabase('clientes_contactos', 'id,nombre,email,cliente_id'),
    zohoAll(token, 'Accounts', 'id,Account_Name'),
    zohoAll(token, 'Contacts', 'id,Full_Name,Email,Account_Name,Account_Name.id'),
    zohoAll(token, 'Calls', 'id,Subject,Call_Start_Time,Call_Duration,Description,Call_Result,Who_Id,What_Id,Owner'),
    zohoAll(token, 'Notes', 'id,Note_Title,Note_Content,Parent_Id,Created_Time,Owner'),
    zohoAll(token, 'Events', 'id,Event_Title,Who_Id,What_Id'),
  ]);

  const cruce = crearCruce({ clientes, contactos });
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c.Account_Name]));
  const zContactoPorId = new Map(zContacts.map((c) => [c.id, c]));
  const llamadaPorId = new Map(llamadas.map((l) => [l.id, l]));
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));

  const informe = {
    generado: new Date().toISOString(),
    totales: {
      clientes: clientes.length,
      contactosLocales: contactos.length,
      cuentasZoho: cuentas.length,
      contactosZoho: zContacts.length,
      llamadas: llamadas.length,
      notas: notas.length,
      eventos: eventos.length,
    },
    llamadas: { casan: 0, sueltas: 0, porVia: {}, ejemplosSueltos: [] },
    notas: { casan: 0, sueltas: 0, porVia: {}, porModuloPadre: { Accounts: 0, Contacts: 0, Calls: 0, Events: 0, otros: 0, sinPadre: 0 }, ejemplosSueltos: [] },
  };

  for (const l of llamadas) {
    const { cliente, via } = cruce.resolverLlamada(l, cuentaPorId, zContactoPorId);
    if (cliente) {
      informe.llamadas.casan += 1;
      informe.llamadas.porVia[via] = (informe.llamadas.porVia[via] ?? 0) + 1;
    } else {
      informe.llamadas.sueltas += 1;
      if (informe.llamadas.ejemplosSueltos.length < 15) {
        informe.llamadas.ejemplosSueltos.push({
          fecha: l.Call_Start_Time,
          asunto: l.Subject,
          contacto: l.Who_Id?.name ?? null,
          cuenta: l.What_Id?.name ?? null,
        });
      }
    }
  }

  for (const n of notas) {
    const parentId = idDe(n.Parent_Id);
    const modulo = apiNameDeModulo(n.$se_module) ?? apiNameDeModulo(n.Parent_Id?.module);
    if (!parentId) informe.notas.porModuloPadre.sinPadre += 1;
    else if (modulo === 'Accounts') informe.notas.porModuloPadre.Accounts += 1;
    else if (modulo === 'Contacts') informe.notas.porModuloPadre.Contacts += 1;
    else if (modulo === 'Calls') informe.notas.porModuloPadre.Calls += 1;
    else if (modulo === 'Events') informe.notas.porModuloPadre.Events += 1;
    else informe.notas.porModuloPadre.otros += 1;

    const { cliente, via } = cruce.resolverNota(n, cuentaPorId, zContactoPorId, llamadaPorId, eventoPorId);
    if (cliente) {
      informe.notas.casan += 1;
      informe.notas.porVia[via] = (informe.notas.porVia[via] ?? 0) + 1;
    } else {
      informe.notas.sueltas += 1;
      if (informe.notas.ejemplosSueltos.length < 15) {
        informe.notas.ejemplosSueltos.push({
          titulo: n.Note_Title,
          fecha: n.Created_Time,
          padre_id: parentId,
          padre_nombre: n.Parent_Id?.name ?? null,
          modulo,
        });
      }
    }
  }

  writeFileSync('informe-zoho.json', JSON.stringify(informe, null, 2));
  console.log(JSON.stringify(informe.totales, null, 2));
  console.log('Llamadas:', informe.llamadas.casan, 'casan ·', informe.llamadas.sueltas, 'sueltas');
  console.log('Notas:   ', informe.notas.casan, 'casan ·', informe.notas.sueltas, 'sueltas');
  console.log('Padres de nota:', JSON.stringify(informe.notas.porModuloPadre));
  console.log('Detalle en informe-zoho.json');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
