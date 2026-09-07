import { HERRAMIENTAS, ejecutar, type Ejecucion } from '@/lib/agente/tools';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CHAT_MODEL ?? 'claude-sonnet-4-5';
const MAX_ITERACIONES = 6;

type ToolUse = { type: 'tool_use'; id: string; name: string; input: Record<string, string | undefined> };
type TextBlock = { type: 'text'; text: string };

export type RespuestaAgente = { texto: string; datos: unknown };

function buildToolsJson() {
  return HERRAMIENTAS.map((h) => ({
    name: h.nombre,
    description: h.descripcion,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(h.params).map(([k, desc]) => [k, { type: 'string', description: desc }])
      ),
      required: Object.keys(h.params),
    },
  }));
}

const systemPrompt = `
Eres el asistente de BI de sfbathroom. Responde SIEMPRE en español y solo con datos de las herramientas.
La métrica base es la facturación neta: suma de facturas + notas de cargo − abonos, imputada en la fecha del documento (no en la fecha del pedido ni del albarán).
Nunca inventes datos. Si la herramienta no da la respuesta, di que no está disponible. Para mostrar tablas, usa formato de texto alineado o explica con palabras.
Sé conciso, factual y directo. Si el usuario pide un filtro, usa primero detalle_clientes u otras herramientas para obtener IDs.
Año por defecto: 2026. Empresa actual: la del contexto del usuario.
`.trim();

export async function consult(
  empresaCodigo: string,
  rol: string | undefined,
  mensajes: { role: 'user' | 'assistant'; content: string }[]
): Promise<RespuestaAgente> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY.');

  const convo: { role: string; content: string | unknown[] }[] = [
    ...mensajes.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: buildToolsJson(),
        messages: convo,
      }),
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Error LLM (${res.status}): ${error}`);
    }
    const body = await res.json();
    const blocks = (body.content ?? []) as (TextBlock | ToolUse)[];
    const texto = blocks.filter((b) => b.type === 'text').map((b) => (b as TextBlock).text).join('\n').trim();
    const toolUses = blocks.filter((b) => b.type === 'tool_use') as ToolUse[];

    if (toolUses.length === 0) return { texto, datos: null };

    convo.push({ role: 'assistant', content: blocks });
    const toolResults: unknown[] = [];
    for (const tu of toolUses) {
      const result = await ejecutar(tu.name, tu.input, empresaCodigo, rol);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
    }
    convo.push({ role: 'user', content: toolResults });
  }

  return { texto: 'He realizado demasiadas consultas seguidas. Intenta de nuevo con una pregunta más concreta.', datos: null };
}