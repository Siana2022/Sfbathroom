# Asistente BI — Arquitectura y diseño

Prototipo mínimo viable (set 2026). Ficheros: `lib/agente/tools.ts`, `lib/agente/agent.ts`,
`app/api/chat/route.ts`, `components/ChatIA.tsx`.

## Modelo de seguridad

El endpoint `/api/chat` obtiene la sesión del usuario con cookies HTTP-only (mismo patrón
que `lib/supabase/server.ts`). Las consultas a Supabase se ejecutan con la **clave
publishable + JWT del usuario logueado**, de modo que todas las políticas RLS se aplican
en la misma capa que el resto de la app: un `comercial` solo ve su cartera, un `lectura`
no accede a márgenes, etc.

**Nunca** se usa `service_role` en el chat. El LLM solo ve los datos que el usuario
autenticado puede ver.

## Variables de entorno

| Variable              | Requerida | Descripción                                                        |
| --------------------- | --------- | ------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`   | sí        | Clave de API de Anthropic (modelos Claude). Se guarda en Vercel.  |
| `CHAT_MODEL`          | no        | Modelo a usar (default: `claude-sonnet-4-5`).                      |
| `NEXT_PUBLIC_*`       | —         | Ya existentes de Supabase; el chat los reutiliza.                  |

**Importante** (Vercel): añadir `ANTHROPIC_API_KEY` en *Settings → Environment Variables*
y marcarla como Server-only (no exponer al cliente).

## Prompt de sistema (resumen)

El asistente conoce las siguientes reglas de negocio:
- **Facturación neta** = facturas + notas de cargo − abonos, imputadas en la fecha del
  documento.
- Año por defecto: 2026. Empresa: la del cookie `sfb_empresa`.
- Responde **siempre en español**, solo con datos de las herramientas, nunca inventa.
- Formato: conciso, factual, directo. Puede presentar tablas simples en texto plano.

Ver `lib/agente/agent.ts` → `systemPrompt` para el texto completo.

## Herramientas (tools)

Cada herramienta es una función TypeScript que ejecuta queries RLS-scoped. El LLM
decide cuándo y con qué parámetros llamarlas.

### ventas_por_mes(ejercicio)
Neta mensual acumulada, unidades y nº de documentos del ejercicio completo.
Returns `{ total_neta, por_mes: [{ mes, etiqueta, neta, unidades, documentos, abonos_y_notas }] }`

### evolucion_anual(mes, ejercicio)
Neta acumulada hasta el mes dado vs mismo mes del año anterior. Devuelve neta, neta_previo
y delta porcentual.

### top_clientes(ejercicio)
Top 10 clientes por neta descendente con importe y peso %.

### desglose_variacion(ejercicio, previo)
Descompone la variación en efecto precio, volumen, mix y efecto nuevos/perdidos/existentes.

### detalle_clientes()
Lista de clientes con id, nombre, estado y país. Útil para obtener IDs de filtro.

### clientes_impagados()
Saldos de cobro por cliente con límite de crédito (stub; ampliable con `v_saldo_clientes`
cuando los datos lo permitan).

### Ampliación prevista
- `detalle_documento(id)` → cabecera y líneas (ya disponible en `lib/datos/documentos.ts`).
- `margen_por_articulo(ejercicio)` → tabla de margen por producto (gated a admin/dirección).
- `vista_semanal(ejercicio)` → facturación por semana ISO.
- Consultas a `v_stock_cobertura`, `v_aging` (acceso a Redis/cache para evitar queries
  pesadas).

## Flujo de la conversación

1. El usuario escribe en el panel flotante (`ChatIA`).
2. El componente envía el historial completo (máx. 20 mensajes) a `POST /api/chat`.
3. El route handler recoge la sesión (empresa + rol), llama a `consult()` en
   `lib/agente/agent.ts`.
4. `consult` construye la petición a la Messages API de Anthropic con las tools y el
   historial. Si el modelo devuelve un `tool_use`, ejecuta la herramienta correspondiente,
   devuelve el resultado como `tool_result`, y repite hasta que el modelo responda con
   texto final (máx. 6 iteraciones).
5. El route handler devuelve `{ texto, datos }` donde `datos` contiene el JSON del
   resultado de la última herramienta utilizada (si la hubo), para que el componente
   pueda renderizar una tabla.

## Extensión — pgvector + RAG (fase posterior)

Para que el agente pueda responder preguntas sobre definiciones de negocio, reglas de
cálculo y esquema sin tener que escribir todo en el prompt:

1. **Tabla `doc_chunks`** en Supabase (extensions: `vector`): embeding de 1536 dimensiones,
   texto del chunk, fuente (ej. `requisitos-cliente.md`), y metadatos (bloque, concepto).
2. **Función SQL `match_doc_chunks(query_embedding, match_count, empresa)`** con
   `pgvector` cosine similarity.
3. **Fase de ingesta**: script Node que procesa `docs/requisitos-cliente.md`,
   `CLAUDE.md`, y los comentarios del esquema SQL, los particiona en chunks de ~500
   tokens, los embedea con `text-embedding-3-small` y los inserta.
4. **Nueva herramienta `buscar_en_kb(query)`** que el agente usa cuando una pregunta
   requiere contexto (ej. "¿qué es la facturación neta?"). Devuelve los 3 chunks más
   relevantes.
5. **Prompts de sistema refinados**: las definiciones clave van en el system prompt
   (nombre del KPI, unidad, fórmula); el RAG cubre reglas más detalladas y contexto
   histórico.

## Limitaciones del prototipo

- Sin persistencia de conversación (el historial vive en el estado del componente; al
  recargar se pierde).
- Sin streaming (la respuesta aparece completa; sin "tipeo" en tiempo real).
- Sin autenticación del LLM (si `ANTHROPIC_API_KEY` no está configurada, devuelve error
  500 con mensaje claro).
- Sin rate limiting (depende de que el usuario autenticado no abuse; en producción añadir
  rate limiter por IP/sesión).
- `clientes_impagados` es un stub; la vista `v_saldo_clientes` es la fuente real cuando
  los datos lo permitan.