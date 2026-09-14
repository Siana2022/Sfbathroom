import type { SupabaseClient } from '@supabase/supabase-js';

export type ContextoJob = {
  supabase: SupabaseClient;
  hoy: string;          // YYYY-MM-DD (zona servidor)
  evento: { job: string; clave: string };
};

export type ResultadoJob = { ok: boolean; detalle?: string };

export type Job = {
  nombre: string;
  descripcion: string;
  /// Clave de idempotencia del día. Por defecto `${job}:${hoy}`.
  claveDeHoy: (hoy: string) => string;
  ejecutar: (ctx: ContextoJob) => Promise<ResultadoJob>;
};

const jobs = new Map<string, Job>();

export function registrarJob(job: Job) {
  jobs.set(job.nombre, job);
}

export function obtenerJob(nombre: string): Job | undefined {
  return jobs.get(nombre);
}

export function listarJobs(): Job[] {
  return [...jobs.values()];
}