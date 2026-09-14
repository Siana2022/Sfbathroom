import { createServiceClient } from '@/lib/supabase/serviceRole';
import { obtenerJob } from '@/lib/jobs/registro';
import type { ResultadoJob } from '@/lib/jobs/registro';

export type EstadoEjecucion = {
  yaEjecutado: boolean;
  ok: boolean;
  detalle?: string;
  registrado: boolean;
};

function hoyLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Ejecuta un job con idempotencia diaria. Marca ok/error en jobs_ejecutados.
 * Si el job ya se ejecutó hoy con estado ok, no vuelve a correr.
 */
export async function ejecutarJob(nombre: string): Promise<EstadoEjecucion> {
  const supabase = createServiceClient();
  const job = obtenerJob(nombre);
  if (!job) return { yaEjecutado: false, ok: false, registrado: false, detalle: `Job no registrado: ${nombre}` };

  const hoy = hoyLocal();
  const clave = job.claveDeHoy(hoy);
  const evento = { job: nombre, clave };

  const { data: existente } = await supabase
    .from('jobs_ejecutados')
    .select('id, estado')
    .eq('job', nombre)
    .eq('clave', clave)
    .maybeSingle();
  if (existente?.estado === 'ok') {
    return { yaEjecutado: true, ok: true, registrado: true, detalle: 'ya ejecutado' };
  }

  let resultado: ResultadoJob;
  try {
    resultado = await job.ejecutar({ supabase, hoy, evento });
  } catch (err) {
    resultado = { ok: false, detalle: err instanceof Error ? err.message : String(err) };
  }

  if (existente) {
    // Intento previo en error hoy: actualizar en vez de duplicar (unique job+clave).
    await supabase
      .from('jobs_ejecutados')
      .update({ estado: resultado.ok ? 'ok' : 'error', detalle: resultado.detalle ?? null, ejecutado_at: new Date().toISOString() })
      .eq('id', existente.id);
  } else {
    await supabase.from('jobs_ejecutados').insert({
      job: nombre,
      clave,
      estado: resultado.ok ? 'ok' : 'error',
      detalle: resultado.detalle ?? null,
    });
  }

  return { yaEjecutado: false, ok: resultado.ok, detalle: resultado.detalle, registrado: true };
}