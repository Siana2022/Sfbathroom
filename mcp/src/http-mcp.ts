import http from 'node:http';
import { herramientas, type RegistroHerramienta } from './herramientas.js';
import './entorno.js';
import { DatosError } from './consulta.js';

const PROTOCOLO = '2024-11-05';
const NOMBRE = 'sfbathroom-bi';
const VERSION = '1.0.0';

const TOKEN = process.env.MCP_TOKEN ?? '';
if (!TOKEN) {
  console.error('[sfbathroom-mcp] Falta MCP_TOKEN (Bearer auth). No arranco sin token.');
  process.exit(1);
}

function schemaJson(shape: RegistroHerramienta['schema']): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    let cur: { _def?: { typeName?: string; description?: string } } | undefined = value;
    let opcional = false;
    while (cur && cur._def?.typeName === 'ZodOptional') {
      cur = (cur._def as unknown as { innerType: typeof cur }).innerType;
      opcional = true;
    }
    const tipo = cur?._def?.typeName === 'ZodNumber' ? 'integer' : cur?._def?.typeName === 'ZodString' ? 'string' : 'object';
    const prop: Record<string, unknown> = { type: tipo };
    if (cur?._def?.description) prop.description = cur._def.description;
    properties[key] = prop;
    if (!opcional) required.push(key);
  }
  return { type: 'object', properties, required };
}

function contenido(args: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(args, null, 2) }] };
}

async function resolver(body: any): Promise<{ jsonrpc: string; id: unknown; result?: unknown; error?: { code: number; message: string } } | { jsonrpc: string; id: unknown; result: unknown }> {
  const id = body?.id ?? null;
  const method = body?.method as string | undefined;

  if (method === 'initialize' || (method?.startsWith('initialize/') ?? false)) {
    return { jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOLO, capabilities: { tools: { listChanged: false } }, serverInfo: { name: NOMBRE, version: VERSION } } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: Object.entries(herramientas).map(([nombre, h]) => ({
          name: nombre,
          description: h.descripcion,
          inputSchema: schemaJson(h.schema),
        })),
      },
    };
  }
  if (method === 'tools/call') {
    const nombre = body?.params?.name as string | undefined;
    const args = (body?.params?.arguments ?? {}) as Record<string, unknown>;
    const h = herramientas[nombre as keyof typeof herramientas];
    if (!h) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Herramienta desconocida: ${nombre}` } };
    try {
      const res = await h.ejecutar(args as never);
      return { jsonrpc: '2.0', id, result: res };
    } catch (e) {
      const msg = e instanceof DatosError ? e.message : e instanceof Error ? e.message : String(e);
      return { jsonrpc: '2.0', id, result: contenido({ error: msg }) };
    }
  }
  if (typeof method === 'string' && (method.startsWith('notifications/') || method.endsWith('/notification'))) {
    return { jsonrpc: '2.0', id: null, result: {} };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } };
}

export interface Peticion {
  method?: string;
  authorization?: string;
  bodyText?: string;
}

export interface Respuesta {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Cache-Control': 'no-store',
};

export async function manejarPeticion(p: Peticion): Promise<Respuesta> {
  if (p.method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };

  if (p.method === 'GET') {
    const disco = { protocolVersion: PROTOCOLO, capabilities: { tools: {} }, serverInfo: { name: NOMBRE, version: VERSION }, _nc: Math.random().toString(36).slice(2, 10) };
    return { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(disco) };
  }

  if (p.authorization !== `Bearer ${TOKEN}`) {
    return { status: 401, headers: CORS, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'No autorizado' } }) };
  }

  if (p.method !== 'POST') {
    return { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Solo GET y POST' } }) };
  }

  let body: any = {};
  try {
    if (p.bodyText) body = JSON.parse(p.bodyText);
  } catch {
    return { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }) };
  }

  const r = await resolver(body);
  return { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(r) };
}

function lecturaPeticion(req: http.IncomingMessage): Promise<Peticion> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 1_048_576) {
        req.destroy();
        resolve({ method: req.method, authorization: String(req.headers.authorization ?? '') });
        return;
      }
      chunks.push(c);
    });
    req.on('end', () =>
      resolve({ method: req.method, authorization: String(req.headers.authorization ?? ''), bodyText: Buffer.concat(chunks).toString('utf8') }),
    );
    req.on('error', () => resolve({ method: req.method, authorization: String(req.headers.authorization ?? '') }));
  });
}

export async function handler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const p = await lecturaPeticion(req);
  const r = await manejarPeticion(p);
  res.writeHead(r.status, r.headers);
  res.end(r.body);
}