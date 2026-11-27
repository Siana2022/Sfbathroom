/**
 * Simulación de importación de Zoho CRM (solo lectura, no escribe nada).
 *
 * Lee llamadas y notas de Zoho, las cruza con los clientes de las tres empresas
 * y genera un informe de coincidencias.
 *
 * Variables necesarias (.env):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 *   ZOHO_DOMAIN=eu                      (eu | com)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: node --env-file=.env ingesta/zoho/simular-importacion.mjs
 */
import { writeFileSync } from 'node:fs';

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

const normalizar = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(S\.?L\.?U?|S\.?A\.?U?|S\.?C\.?P|SOCIEDAD LIMITADA)\b/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?select=${campos}&range=${desde}-${desde + 999}`, {
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

function indiceClientes(clientes) {
  const porNombre = new Map();
  const porCif = new Map();
  for (const c of clientes) {
    const n = normalizar(c.nombre);
    if (n) porNombre.set(n, c);
    if (c.cif) porCif.set(String(c.cif).replace(/[^A-Z0-9]/gi, '').toUpperCase(), c);
  }
  return { porNombre, porCif };
}

function buscarCliente(texto, idx, clientes) {
  const n = normalizar(texto);
  if (!n) return null;
  if (idx.porNombre.has(n)) return idx.porNombre.get(n);
  // coincidencia por nombre contenido en el asunto (el más largo gana)
  let mejor = null;
  for (const c of clientes) {
    const cn = normalizar(c.nombre);
    if (cn.length < 4) continue;
    if (n.includes(cn) && (!mejor || cn.length > normalizar(mejor.nombre).length)) mejor = c;
  }
  return mejor;
}

async function main() {
  const token = await tokenZoho();
  const [clientes, contactos] = await Promise.all([
    supabase('clientes', 'id,nombre,cif,empresa_id'),
    supabase('clientes_contactos', 'id,nombre,email,cliente_id'),
  ]);
  const idx = indiceClientes(clientes);
  const contactoPorEmail = new Map(contactos.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));

  const [cuentas, zContacts, llamadas, notas] = await Promise.all([
    zohoAll(token, 'Accounts', 'id,Account_Name'),
    zohoAll(token, 'Contacts', 'id,Full_Name,Email,Account_Name,Account_Name.id'),
    zohoAll(token, 'Calls', 'id,Subject,Call_Start_Time,Call_Duration,Description,Call_Result,Who_Id,What_Id,Owner'),
    zohoAll(token, 'Notes', 'id,Note_Title,Note_Content,Parent_Id,Created_Time,Owner'),
  ]);

  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c.Account_Name]));
  const zContactoPorId = new Map(zContacts.map((c) => [c.id, c]));

  const resolver = (fila) => {
    // 1) por cuenta relacionada
    const whatId = fila.What_Id?.id ?? fila.What_Id;
    if (whatId && cuentaPorId.has(whatId)) {
      const c = buscarCliente(cuentaPorId.get(whatId), idx, clientes);
      if (c) return { cliente: c, via: 'cuenta' };
    }
    // 2) por contacto relacionado
    const whoId = fila.Who_Id?.id ?? fila.Who_Id;
    if (whoId && zContactoPorId.has(whoId)) {
      const zc = zContactoPorId.get(whoId);
      if (zc.Email && contactoPorEmail.has(String(zc.Email).toLowerCase())) {
        const c = clientes.find((x) => x.id === contactoPorEmail.get(String(zc.Email).toLowerCase()).cliente_id);
        if (c) return { cliente: c, via: 'contacto-email' };
      }
      const porCuenta = zc.Account_Name?.id ? cuentaPorId.get(zc.Account_Name.id) : zc.Account_Name;
      if (porCuenta) {
        const c = buscarCliente(porCuenta, idx, clientes);
        if (c) return { cliente: c, via: 'contacto-cuenta' };
      }
    }
    // 3) por texto del asunto
    const c = buscarCliente(fila.Subject ?? fila.Note_Title, idx, clientes);
    if (c) return { cliente: c, via: 'texto' };
    return { cliente: null, via: null };
  };

  const informe = {
    generado: new Date().toISOString(),
    totales: { clientes: clientes.length, cuentasZoho: cuentas.length, contactosZoho: zContacts.length, llamadas: llamadas.length, notas: notas.length },
    llamadas: { casan: 0, sueltas: 0, porVia: {}, sinTexto: 0, ejemplosSueltos: [] },
    notas: { casan: 0, sueltas: 0, porVia: {}, ejemplosSueltos: [] },
  };

  for (const l of llamadas) {
    const { cliente, via } = resolver(l);
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
    const { cliente, via } = resolver(n);
    if (cliente) {
      informe.notas.casan += 1;
      informe.notas.porVia[via] = (informe.notas.porVia[via] ?? 0) + 1;
    } else {
      informe.notas.sueltas += 1;
      if (informe.notas.ejemplosSueltos.length < 15) {
        informe.notas.ejemplosSueltos.push({ titulo: n.Note_Title, fecha: n.Created_Time });
      }
    }
  }

  writeFileSync('informe-zoho.json', JSON.stringify(informe, null, 2));
  console.log(JSON.stringify(informe.totales, null, 2));
  console.log('Llamadas:', informe.llamadas.casan, 'casan ·', informe.llamadas.sueltas, 'sueltas');
  console.log('Notas:   ', informe.notas.casan, 'casan ·', informe.notas.sueltas, 'sueltas');
  console.log('Detalle en informe-zoho.json');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
