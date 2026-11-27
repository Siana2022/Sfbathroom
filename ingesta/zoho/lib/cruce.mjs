/**
 * Cruce de registros de Zoho CRM con los clientes locales.
 *
 * Lo usan tanto la simulación (`simular-importacion.mjs`) como el importador
 * (`importar-llamadas.mjs`): si cada uno tuviera su copia, acabarían contando distinto.
 *
 * Reglas (docs/importacion-zoho.md §4):
 *  - Cuenta → cliente: primero CIF, luego nombre normalizado. Nunca difuso automático
 *    (el "nombre contenido en el asunto" solo se usa como último recurso del texto).
 *  - Contacto → contacto local: por email.
 *  - Nunca se inventa un cliente: si no casa, se devuelve null.
 */

export function normalizar(valor) {
  return (valor ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(S\.?L\.?U?|S\.?A\.?U?|S\.?C\.?P|SOCIEDAD LIMITADA)\b/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `$se_module` / `Parent_Id.module` pueden venir como texto o como objeto {api_name}. */
export function apiNameDeModulo(modulo) {
  if (!modulo) return null;
  if (typeof modulo === 'string') return modulo;
  return modulo.api_name ?? null;
}

/** `What_Id`/`Parent_Id` pueden venir como objeto {id,name} o como id suelto. */
export function idDe(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor;
  return valor.id ?? null;
}

export function indiceClientes(clientes) {
  const porNombre = new Map();
  const porCif = new Map();
  for (const c of clientes) {
    const n = normalizar(c.nombre);
    if (n) porNombre.set(n, c);
    if (c.cif) porCif.set(String(c.cif).replace(/[^A-Z0-9]/gi, '').toUpperCase(), c);
  }
  return { porNombre, porCif };
}

export function buscarCliente(texto, idx, clientes) {
  const n = normalizar(texto);
  if (!n) return null;
  if (idx.porNombre.has(n)) return idx.porNombre.get(n);
  // Último recurso: nombre de cliente contenido en el texto, gana el más largo.
  let mejor = null;
  for (const c of clientes) {
    const cn = normalizar(c.nombre);
    if (cn.length < 4) continue;
    if (n.includes(cn) && (!mejor || cn.length > normalizar(mejor.nombre).length)) mejor = c;
  }
  return mejor;
}

/**
 * Prepara los resolvers a partir de los clientes y contactos locales.
 * Los mapas de Zoho (cuenta/contacto por id) se pasan a cada resolución porque
 * dependen de lo que devuelva la API en esa ejecución.
 */
export function crearCruce({ clientes, contactos }) {
  const idx = indiceClientes(clientes);
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  const contactoPorEmail = new Map();
  for (const c of contactos) {
    const email = (c.email ?? '').toString().trim().toLowerCase();
    if (email) contactoPorEmail.set(email, c);
  }

  /** Contacto local a partir de un contacto de Zoho (solo por email). */
  function contactoLocalDe(zContacto) {
    const email = (zContacto?.Email ?? '').toString().trim().toLowerCase();
    return email ? contactoPorEmail.get(email) ?? null : null;
  }

  /** Nombre de la cuenta de un contacto de Zoho (objeto o texto). */
  function cuentaDeContacto(zContacto, cuentaPorId) {
    const rel = zContacto?.Account_Name;
    const id = idDe(rel);
    if (id && cuentaPorId?.has(id)) return cuentaPorId.get(id);
    if (rel && typeof rel === 'object' && rel.name) return rel.name;
    return typeof rel === 'string' ? rel : null;
  }

  /** Resuelve un contacto de Zoho: primero su email, luego la cuenta que tiene asociada. */
  function resolverContactoZoho(zContacto, cuentaPorId, viaEmail, viaCuenta) {
    if (!zContacto) return null;
    const local = contactoLocalDe(zContacto);
    if (local?.cliente_id) {
      const c = clientePorId.get(local.cliente_id);
      if (c) return { cliente: c, via: viaEmail, contacto: local };
    }
    const cuenta = cuentaDeContacto(zContacto, cuentaPorId);
    const c = buscarCliente(cuenta, idx, clientes);
    if (c) return { cliente: c, via: viaCuenta, contacto: local };
    return null;
  }

  /**
   * Llamada de Zoho: `What_Id` (cuenta), `Who_Id` (contacto), y el asunto como último recurso.
   */
  function resolverLlamada(llamada, cuentaPorId, zContactoPorId) {
    const whatId = idDe(llamada.What_Id);
    if (whatId && cuentaPorId.has(whatId)) {
      const c = buscarCliente(cuentaPorId.get(whatId), idx, clientes);
      if (c) return { cliente: c, via: 'cuenta', contacto: null };
    }

    const whoId = idDe(llamada.Who_Id);
    if (whoId && zContactoPorId.has(whoId)) {
      const r = resolverContactoZoho(zContactoPorId.get(whoId), cuentaPorId, 'contacto-email', 'contacto-cuenta');
      if (r) return r;
    }

    const porTexto = buscarCliente(llamada.Subject, idx, clientes);
    if (porTexto) return { cliente: porTexto, via: 'texto', contacto: null };
    return { cliente: null, via: null, contacto: null };
  }

  /**
   * Nota de Zoho: el vínculo real está en `Parent_Id`. En sfbathroom casi todas cuelgan
   * de una **llamada**, no de una cuenta o un contacto, así que el orden es:
   *   1. si el padre es una llamada → el cliente de esa llamada (vínculo exacto);
   *   2. si es una cuenta → el cliente de esa cuenta;
   *   3. si es un contacto → su email o su cuenta;
   *   4. y si no trae módulo, se deduce por el id.
   */
  function resolverNota(nota, cuentaPorId, zContactoPorId, llamadaPorId) {
    const parentId = idDe(nota.Parent_Id);
    const modulo = apiNameDeModulo(nota.$se_module) ?? apiNameDeModulo(nota.Parent_Id?.module);

    if (parentId) {
      const esLlamada = modulo === 'Calls' || (!modulo && llamadaPorId?.has(parentId));
      if (esLlamada && llamadaPorId?.has(parentId)) {
        const r = resolverLlamada(llamadaPorId.get(parentId), cuentaPorId, zContactoPorId);
        if (r.cliente) return { cliente: r.cliente, via: 'nota-llamada', contacto: r.contacto };
      }

      const esCuenta = modulo === 'Accounts' || (!modulo && cuentaPorId.has(parentId));
      if (esCuenta && cuentaPorId.has(parentId)) {
        const c = buscarCliente(cuentaPorId.get(parentId), idx, clientes);
        if (c) return { cliente: c, via: 'nota-cuenta', contacto: null };
      }

      if (zContactoPorId.has(parentId)) {
        const r = resolverContactoZoho(zContactoPorId.get(parentId), cuentaPorId, 'nota-contacto-email', 'nota-contacto-cuenta');
        if (r) return r;
      }

      // Módulo desconocido y el id resulta ser una cuenta.
      if (!esCuenta && cuentaPorId.has(parentId)) {
        const c = buscarCliente(cuentaPorId.get(parentId), idx, clientes);
        if (c) return { cliente: c, via: 'nota-cuenta', contacto: null };
      }
    }

    const porTexto = buscarCliente(nota.Note_Title, idx, clientes);
    if (porTexto) return { cliente: porTexto, via: 'nota-texto', contacto: null };
    return { cliente: null, via: null, contacto: null };
  }

  return { idx, clientes, clientePorId, contactoPorEmail, resolverLlamada, resolverNota };
}
