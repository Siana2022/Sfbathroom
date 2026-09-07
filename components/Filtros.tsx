'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OpcionesFiltros } from '@/lib/datos/filtros';

type Props = {
  opciones: OpcionesFiltros;
};

function FiltrosInner({ opciones }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setUrl(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [clave, valor] of Object.entries(patch)) {
      if (valor && valor.trim() !== '') params.set(clave, valor.trim());
      else params.delete(clave);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function limpiar() {
    router.push(pathname);
  }

  const valor = (clave: string) => sp.get(clave) ?? '';
  const hayFiltros = [...sp.keys()].some((k) =>
    ['cliente', 'comercial', 'familia', 'marca', 'desde', 'hasta'].includes(k),
  );

  return (
    <div className="barra-filtros">
      <span className="barra-filtros-titulo">Filtros</span>

      <label className="campo-filtro">
        Cliente
        <select value={valor('cliente')} onChange={(e) => setUrl({ cliente: e.target.value || undefined })}>
          <option value="">Todos</option>
          {opciones.clientes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="campo-filtro">
        Comercial
        <select value={valor('comercial')} onChange={(e) => setUrl({ comercial: e.target.value || undefined })}>
          <option value="">Todos</option>
          {opciones.comerciales.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="campo-filtro">
        Familia
        <select value={valor('familia')} onChange={(e) => setUrl({ familia: e.target.value || undefined })}>
          <option value="">Todas</option>
          {opciones.familias.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="campo-filtro">
        Marca
        <select value={valor('marca')} onChange={(e) => setUrl({ marca: e.target.value || undefined })}>
          <option value="">Todas</option>
          {opciones.marcas.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="campo-filtro">
        Desde
        <input type="date" value={valor('desde')} onChange={(e) => setUrl({ desde: e.target.value || undefined })} />
      </label>

      <label className="campo-filtro">
        Hasta
        <input type="date" value={valor('hasta')} onChange={(e) => setUrl({ hasta: e.target.value || undefined })} />
      </label>

      <button className="boton" onClick={limpiar} disabled={!hayFiltros}>
        Limpiar
      </button>
    </div>
  );
}

export default function Filtros(props: Props) {
  return (
    <Suspense fallback={null}>
      <FiltrosInner {...props} />
    </Suspense>
  );
}