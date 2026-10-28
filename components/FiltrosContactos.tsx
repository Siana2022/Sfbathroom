'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Props = {
  paises: { valor: string; n: number }[];
  provincias: { valor: string; n: number }[];
};

/**
 * Filtros del listado de contactos: texto libre, país, provincia y "sin email".
 *
 * Las opciones salen de los propios contactos, así que no se puede segmentar por
 * un territorio en el que no hay nadie. Al cambiar un filtro se vuelve a la
 * página 1.
 */
function FiltrosContactosInner({ paises, provincias }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const q = sp.get('q') ?? '';
  const pais = sp.get('pais') ?? '';
  const provincia = sp.get('provincia') ?? '';
  const sinEmail = sp.get('sinEmail') === '1';

  function setUrl(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [clave, valor] of Object.entries(patch)) {
      if (valor) params.set(clave, valor);
      else params.delete(clave);
    }
    params.delete('pagina');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hayAlguno = Boolean(q || pais || provincia || sinEmail);

  return (
    <div className="barra-filtros">
      <span className="barra-filtros-titulo">Contactos</span>

      <label className="campo-filtro">
        Buscar
        <input
          type="search"
          value={q}
          placeholder="Nombre, cargo o cliente"
          onChange={(e) => setUrl({ q: e.target.value || undefined })}
        />
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

      <label className="campo-filtro" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={sinEmail}
          onChange={(e) => setUrl({ sinEmail: e.target.checked ? '1' : undefined })}
        />
        Solo sin email
      </label>

      <button
        className="boton"
        type="button"
        disabled={!hayAlguno}
        onClick={() => setUrl({ q: undefined, pais: undefined, provincia: undefined, sinEmail: undefined })}
      >
        Limpiar
      </button>
    </div>
  );
}

export default function FiltrosContactos(props: Props) {
  return (
    <Suspense fallback={null}>
      <FiltrosContactosInner {...props} />
    </Suspense>
  );
}
