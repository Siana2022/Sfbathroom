/**
 * Filtrado de contactos para la pestaña de contactos. Puro, sin React ni
 * Supabase.
 *
 * El listado de contactos alimenta los envíos masivos: lo que se filtra aquí es
 * a quién le va a llegar un correo, así que el filtro territorial no puede
 * inventarse pertenencias. Un contacto sin provincia no cae en el filtro de una
 * provincia concreta: no se puede afirmar que esté en una que no consta.
 */

export type FiltrosContactos = {
  /** Búsqueda por nombre, apellidos, cargo o cliente. */
  texto?: string;
  pais?: string;
  provincia?: string;
  /** Solo contactos sin email: los que se quedarían fuera de un envío. */
  sinEmail?: boolean;
};

export type ContactoFiltrable = {
  cliente: string;
  nombre: string;
  apellidos: string | null;
  cargo: string | null;
  email: string | null;
  pais: string | null;
  provincia: string | null;
};

export function normalizarFiltrosContactos(sp: {
  q?: string | string[];
  pais?: string | string[];
  provincia?: string | string[];
  sinEmail?: string | string[];
}): FiltrosContactos {
  const texto = typeof sp.q === 'string' ? sp.q.trim() : '';
  return {
    texto: texto === '' ? undefined : texto,
    pais: typeof sp.pais === 'string' && sp.pais.trim() !== '' ? sp.pais.trim() : undefined,
    provincia: typeof sp.provincia === 'string' && sp.provincia.trim() !== '' ? sp.provincia.trim() : undefined,
    sinEmail: sp.sinEmail === '1',
  };
}

export function hayFiltrosContactos(f: FiltrosContactos): boolean {
  return Boolean(f.texto || f.pais || f.provincia || f.sinEmail);
}

export function filtrarContactos<T extends ContactoFiltrable>(filas: T[], f: FiltrosContactos): T[] {
  const busca = f.texto?.toLocaleLowerCase('es');
  return filas.filter((c) => {
    if (busca) {
      const heno = [c.cliente, c.nombre, c.apellidos, c.cargo].filter(Boolean).join(' ').toLocaleLowerCase('es');
      if (!heno.includes(busca)) return false;
    }
    if (f.pais && c.pais !== f.pais) return false;
    if (f.provincia && c.provincia !== f.provincia) return false;
    if (f.sinEmail && c.email) return false;
    return true;
  });
}

/** Opciones de país y provincia presentes en los contactos, con su recuento. */
export function opcionesTerritorio<T extends ContactoFiltrable>(
  filas: T[],
  campo: 'pais' | 'provincia',
): { valor: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const c of filas) {
    const v = c[campo];
    if (!v) continue;
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, 'es'));
}
