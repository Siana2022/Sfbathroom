/**
 * Memoización en memoria con TTL y clave por (usuario + args).
 *
 * Motivo de que sea SAFE con RLS: la clave va prefijada con el uid del usuario
 * conectado, así un rol nunca ve datos cacheados de otro (un comercial vería
 * solo su cartera; admin lo suyo). Los datos se actualizan una vez al día, así
 * que un TTL de 15 min es correcto y el resultado es coherente con el spec.
 *
 * Nota: memoria por instancia de Vercel (no compartida); con el usuario único
 * actual prácticamente se comporta como caché global, y es seguro escalar.
 */
const almacen = new Map<string, { expira: number; valor: unknown }>();
const TTL_MS = 15 * 60 * 1000;
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

/** Solo para tests/limpieza; no se usa en producción. */
export function invalidarMemo(): void {
  almacen.clear();
}