/**
 * Matriz de acceso por rol. Pura y sin dependencias, para poder testearla y
 * para poder usarla tanto en el servidor (guardas) como en el cliente (menú).
 *
 * Regla de negocio (decidida por el cliente, 2026-10):
 *   - `comercial`     → solo el módulo comercial, más la facturación y el
 *                       stock (los necesita para vender).
 *   - `direccion`     → todo, incluida la cartera de cualquier comercial.
 *   - resto de roles  → en espera: siguen viendo lo que veían. Se irán
 *                       ajustando cuando el cliente los defina.
 *
 * El aislamiento real de datos NO depende de esto: lo garantiza el RLS. Esta
 * matriz solo decide qué se le enseña a cada uno, para no llenarle el menú de
 * módulos que no le corresponden.
 */

export type Rol = 'comercial' | 'direccion' | 'admin' | 'financiero' | 'lectura' | 'administracion' | 'almacen';

export const ROLES_CONOCIDOS: Rol[] = [
  'comercial',
  'direccion',
  'admin',
  'financiero',
  'lectura',
  'administracion',
  'almacen',
];

/** Rutas que puede abrir un comercial, además de todo lo suyo. */
export const RUTAS_COMERCIAL = ['/facturacion', '/stock'];

/** Prefijo del módulo comercial. */
export const PREFIJO_COMERCIAL = '/comercial';

/**
 * ¿Puede este rol entrar a esta ruta?
 *
 * Un rol desconocido (o nulo) no se restringe: es preferible dejarle ver de
 * más a un rol que aún no hemos definido que dejarle fuera de su trabajo. Los
 * datos siguen protegidos por RLS en cualquier caso.
 */
export function puedeEntrar(rol: string | null | undefined, ruta: string): boolean {
  if (!rol || !ROLES_CONOCIDOS.includes(rol as Rol)) return true;
  if (rol !== 'comercial') return true;

  const limpia = ruta.split('?')[0];
  if (limpia === PREFIJO_COMERCIAL || limpia.startsWith(`${PREFIJO_COMERCIAL}/`)) return true;
  return RUTAS_COMERCIAL.some((r) => limpia === r || limpia.startsWith(`${r}/`));
}

/**
 * Rutas que un rol restringido NO debe ver en el menú. Devuelve un predicado
 * para no recorrer la matriz en cada enlace.
 */
export function esRutaVisible(rol: string | null | undefined, ruta: string): boolean {
  return puedeEntrar(rol, ruta);
}

/** ¿Este rol ve el cuadro de mando general (los 16 bloques)? */
export function veCuadroMando(rol: string | null | undefined): boolean {
  if (!rol) return true;
  if (!ROLES_CONOCIDOS.includes(rol as Rol)) return true;
  return rol !== 'comercial';
}

/** ¿Puede este rol consultar la cartera de cualquier comercial? */
export function puedeElegirComercial(rol: string | null | undefined): boolean {
  return rol === 'direccion' || rol === 'admin';
}
