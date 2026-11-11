/**
 * Memoización en memoria con TTL y clave por (usuario + args).
 *
 * Motivo de que sea SAFE con RLS: la clave va prefijada con el uid del usuario
 * conectado, así un rol nunca ve datos cacheados de otro (un comercial vería
 * solo su cartera; admin lo suyo). Los datos se actualizan una vez al día.
 *
 * ¿Por qué NO `unstable_cache`/`revalidateTag` de Next.js para los agregados?
 * Las funciones de `lib/datos/*` leen la sesión con `cookies()`; `unstable_cache`
 * NO incluye la cabecera `Authorization` en su clave, así que cachearía el
 * resultado de un rol y se lo serviría a otro → fuga de RLS entre carteras
 * (ya avisado en CLAUDE.md). Por eso la caché se mantiene como un Map en memoria
 * con clave prefijada por uid, que es RLS-safe.
 *
 * Limitación conocida: la memoria es por instancia serverless (efímera, no
 * compartida), así que cambiar de empresa suele ser un "miss". Esto dejó de ser
 * crítico: con la agregación movida a Postgres (RPC perf_* + materializada), un
 * miss cuesta decenas de ms en vez de segundos. La caché solo evita recomputar
 * dentro de una misma instancia caliente.
 *
 * TTL: los agregados de negocio cambian como mucho una vez al día (ingesta
 * nocturna A3ERP), así que `TTL_DIARIO_MS` (12 h) es el valor adecuado para
 * ellos; `memo()` conserva un TTL corto (15 min) para datos más volátiles.
 */
const almacen = new Map<string, { expira: number; valor: unknown }>();
const TTL_MS = 15 * 60 * 1000;
/** TTL para agregados que solo cambian con la ingesta diaria. */
export const TTL_DIARIO_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRADAS = 200;

export async function memo<T>(clave: string, fn: () => Promise<T>, ttlMs = TTL_MS): Promise<T> {
  const ahora = Date.now();
  const hit = almacen.get(clave);
  if (hit && hit.expira > ahora) return hit.valor as T;

  const valor = await fn();
  almacen.set(clave, { expira: ahora + ttlMs, valor });
  if (almacen.size > MAX_ENTRADAS) {
    const primera = almacen.keys().next().value;
    if (primera !== undefined) almacen.delete(primera);
  }
  return valor;
}

/**
 * Igual que `memo()` pero con el TTL alineado a la ingesta diaria (12 h). Para
 * agregados cuyo origen (facturas A3ERP) solo cambia una vez al día. La clave
 * debe seguir prefijada por uid para no filtrar entre roles (ver arriba).
 */
export async function memoDiario<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  return memo(clave, fn, TTL_DIARIO_MS);
}

/** Solo para tests/limpieza; no se usa en producción. */
export function invalidarMemo(): void {
  almacen.clear();
}
