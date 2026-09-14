/**
 * Abstracción de proveedor LLM soportado.
 * Cambia LLM_PROVIDER y las keys en Vercel para cambiar de proveedor sin tocar código.
 *
 * Provedores soportados:
 *   - "gemini"  → Google Gemini (tier gratuita: 15 RPM, 1M tokens/día)
 *   - "openai"  → OpenAI-compatible (Groq, Together, OpenRouter, etc.)
 *   - "anthropic" → Anthropic Claude (requiere ANTHROPIC_API_KEY)
 */

export type LLMProvider = 'gemini' | 'openai' | 'anthropic';

export type LLMTool = {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required: boolean }>;
};

export type LLMMessage = { role: 'user' | 'assistant' | 'system'; content: string | unknown[] };

export type LLMToolCall = { id: string; name: string; input: Record<string, string | undefined> };

export type LLMResponse = {
  text: string;
  toolCalls: LLMToolCall[];
};

function provider(): LLMProvider {
  const p = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
  if (p === 'anthropic') return 'anthropic';
  if (p === 'openai') return 'openai';
  return 'gemini';
}

// ─── Gemini ────────────────────────────────────────────────────────────

async function geminiCall(
  system: string,
  messages: LLMMessage[],
  tools: LLMTool[],
  model: string,
): Promise<LLMResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY.');

  const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;

  const oaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
      },
    },
  }));

  const oaiMessages = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: oaiMessages, tools: oaiTools, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error Gemini (${res.status}): ${err}`);
  }

  const body = await res.json();
  const choice = body.choices?.[0];
  const msg = choice?.message;
  if (!msg) return { text: 'Sin respuesta del modelo.', toolCalls: [] };

  const text = msg.content ?? '';
  const toolCalls: LLMToolCall[] = (msg.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments ?? '{}'),
  }));

  return { text, toolCalls };
}

// ─── OpenAI-compatible (Groq, Together, etc.) ──────────────────────────

async function openaiCall(
  system: string,
  messages: LLMMessage[],
  tools: LLMTool[],
  model: string,
): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY.');

  const oaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
      },
    },
  }));

  const oaiMessages = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: oaiMessages, tools: oaiTools, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error LLM (${res.status}): ${err}`);
  }

  const body = await res.json();
  const choice = body.choices?.[0];
  const msg = choice?.message;
  if (!msg) return { text: 'Sin respuesta del modelo.', toolCalls: [] };

  const text = msg.content ?? '';
  const toolCalls: LLMToolCall[] = (msg.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments ?? '{}'),
  }));

  return { text, toolCalls };
}

// ─── Anthropic ─────────────────────────────────────────────────────────

async function anthropicCall(
  system: string,
  messages: LLMMessage[],
  tools: LLMTool[],
  model: string,
): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY.');

  const antTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
      ),
      required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
    },
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      tools: antTools,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error Anthropic (${res.status}): ${err}`);
  }

  const body = await res.json();
  const blocks = (body.content ?? []) as { type: string; text?: string; id?: string; name?: string; input?: Record<string, string | undefined> }[];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
  const toolCalls: LLMToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id ?? '', name: b.name ?? '', input: b.input ?? {} }));

  return { text, toolCalls };
}

// ─── Dispatcher ────────────────────────────────────────────────────────

export async function callLLM(
  system: string,
  messages: LLMMessage[],
  tools: LLMTool[],
): Promise<LLMResponse> {
  const p = provider();
  const model = process.env.CHAT_MODEL ?? defaults[p];

  if (p === 'gemini') return geminiCall(system, messages, tools, model);
  if (p === 'openai') return openaiCall(system, messages, tools, model);
  return anthropicCall(system, messages, tools, model);
}

const defaults: Record<LLMProvider, string> = {
  gemini: 'gemini-2.0-flash',
  openai: 'openai/gpt-oss-20b',
  anthropic: 'claude-sonnet-4-5',
};

export function defaultModel(): string {
  return defaults[provider()];
}
