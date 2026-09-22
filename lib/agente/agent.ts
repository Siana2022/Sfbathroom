import { HERRAMIENTAS, ejecutar } from '@/lib/agente/tools';
import { callLLM, type LLMTool, type LLMMessage } from '@/lib/agente/llm';

const MAX_ITERACIONES = 6;

export type RespuestaAgente = { texto: string; datos: unknown };

function buildTools(): LLMTool[] {
  return HERRAMIENTAS.map((h) => ({
    name: h.nombre,
    description: h.descripcion,
    parameters: Object.fromEntries(
      Object.entries(h.params).map(([k, desc]) => [k, { type: 'string', description: desc, required: true }])
    ),
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
  const convo: LLMMessage[] = mensajes.map((m) => ({ role: m.role, content: m.content }));
  const tools = buildTools();

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const res = await callLLM(systemPrompt, convo, tools);

    if (res.toolCalls.length === 0) return { texto: res.text, datos: null };

    convo.push({ role: 'assistant', content: res.text || '(tool call)' });
    for (const tc of res.toolCalls) {
      const result = await ejecutar(tc.name, tc.input, empresaCodigo, rol);
      convo.push({ role: 'user', content: JSON.stringify(result) });
    }
  }

  return { texto: 'He realizado demasiadas consultas seguidas. Intenta de nuevo con una pregunta más concreta.', datos: null };
}
