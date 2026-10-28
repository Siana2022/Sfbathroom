'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ESTADOS_CRM } from '@/lib/comercial/tipos';

type Props = {
  /** Provincias presentes en la cartera, con su recuento. */
  provincias: { valor: string; n: number }[];
  paises: { valor: string; n: number }[];
};

/**
 * Filtros de la cartera: cliente, provincia y país.
 *
 * Escriben en la URL, como el resto de filtros de la app, para que el enlace
 * sea compartible. Al cambiar un filtro se vuelve a la página 1: quedarse en la
 * página 4 de un listado que acaba de encogerse mostraría una vista vacía.
 *
 * Las opciones salen de la propia cartera, no de una lista fija de provincias:
 * así solo se ofrecen las que tienen clientes y no se puede filtrar por una
 * provincia en la que no hay nadie.
 */
function FiltrosCarteraInner({ provincias, paises }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const cliente = sp.get('cliente') ?? '';
  const provincia = sp.get('provincia') ?? '';
  const pais = sp.get('pais') ?? '';
  const estado = sp.get('estado') ?? '';

  function setUrl(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [clave, valor] of Object.entries(patch)) {
      if (valor) params.set(clave, valor);
      else params.delete(clave);
    }
    // Cualquier cambio de filtro invalida la página en la que estaba.
    params.delete('pagina');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hayAlguno = Boolean(cliente || provincia || pais || estado);

  return (
    <div className="barra-filtros">
      <span className="barra-filtros-titulo">Cartera</span>

      <label className="campo-filtro">
        Cliente
        <input
          type="search"
          value={cliente}
          placeholder="Buscar por nombre"
          onChange={(e) => setUrl({ cliente: e.target.value || undefined })}
        />
      </label>

      <label className="campo-filtro">
        Provincia
        <select value={provincia} onChange={(e) => setUrl({ provincia: e.target.value || undefined })}>
          <option value="">Todas</option>
          {provincias.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.valor} ({p.n})
            </option>
          ))}
        </select>
      </label>

      <label className="campo-filtro">
        País
        <select value={pais} onChange={(e) => setUrl({ pais: e.target.value || undefined })}>
          <option value="">Todos</option>
          {paises.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.valor} ({p.n})
            </option>
          ))}
        </select>
      </label>

      <label className="campo-filtro">
        Estado
        <select value={estado} onChange={(e) => setUrl({ estado: e.target.value || undefined })}>
          <option value="">Todos</option>
          {ESTADOS_CRM.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <button className="boton" type="button" onClick={() => setUrl({ cliente: undefined, provincia: undefined, pais: undefined, estado: undefined })} disabled={!hayAlguno}>
        Limpiar
      </button>
    </div>
  );
}

export default function FiltrosCartera(props: Props) {
  return (
    <Suspense fallback={null}>
      <FiltrosCarteraInner {...props} />
    </Suspense>
  );
}
