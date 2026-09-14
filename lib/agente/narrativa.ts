import { callLLM } from '@/lib/agente/llm';

const TIMEOUT_MS = 8_000;

/**
 * Genera texto narrativo a partir de datos + instrucción.
 * Reutiliza callLLM (multi-proveedor). Tiene fallback determinista:
 * si el LLM falla o tarda, devuelve plantilla(datos).
 */
export async function generarNarrativa(
  datos: Record<string, unknown>,
  instruccion: string,
  plantilla: (d: Record<string, unknown>) => string,
): Promise<{ texto: string; fuente: 'ia' | 'plantilla'; detalle?: string }> {
  const system = 'Eres el analista financiero y comercial de sfbathroom. Responde en español, conciso, ejecutivo, 3-5 frases, con cifras exactas, sin relleno.';
  const prompt = `${instruccion}\n\nDatos:\n${JSON.stringify(datos, null, 2)}`;
  try {
    const respuesta = await Promise.race([
      callLLM(system, [{ role: 'user', content: prompt }], []),
      timeoutPromise(),
    ]);
    return { texto: respuesta.text || plantilla(datos), fuente: 'ia' };
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.warn('[narrativa] LLM fallback → plantilla:', detalle);
    return { texto: plantilla(datos), fuente: 'plantilla', detalle };
  }
}

function timeoutPromise(): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`Timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
}

const euroFmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const numFmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 });

// Plantillas predefinidas para resúmenes y reportes

export function plantillaResumenDiario(d: Record<string, unknown>): string {
  const neta = (d.neta as number) ?? 0;
  const prev = (d.netaPrevio as number) ?? 0;
  const deltaNum = prev > 0 ? ((neta - prev) / prev) * 100 : null;
  const delta = deltaNum == null ? null : `${deltaNum > 0 ? '+' : ''}${deltaNum.toFixed(1)}%`;
  const ticket = (d.ticketMedio as number) ?? 0;
  const nClientes = (d.numClientes as number) ?? 0;
  const cumplimiento = d.cumplimiento as number | null;

  const lineas: string[] = [];
  lineas.push(`Facturación neta: ${euroFmt(neta)}${delta ? ` (Δ vs previo: ${delta})` : ''}.`);
  lineas.push(`Ticket medio: ${euroFmt(ticket)}. Clientes activos: ${numFmt(nClientes)}.`);
  if (cumplimiento != null) lineas.push(`Cumplimiento presupuesto: ${cumplimiento.toFixed(1)}%.`);
  return lineas.join(' ');
}

export function plantillaInformeSemanal(d: Record<string, unknown>): string {
  return [
    `Informe semanal:`,
    `• Facturación: ${euroFmt((d.neta as number) ?? 0)}.`,
    `• Ticket medio: ${euroFmt((d.ticketMedio as number) ?? 0)}.`,
    `• Unidades: ${numFmt((d.unidades as number) ?? 0)}.`,
    `• Clientes activos: ${numFmt((d.numClientes as number) ?? 0)}.`,
  ].join('\n');
}