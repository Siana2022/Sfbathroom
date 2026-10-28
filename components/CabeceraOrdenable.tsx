'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { alternarOrden, normalizarOrden, type ColumnaOrden } from '@/lib/comercial/carteraFiltros';

type Props = {
  /** Columna a la que corresponde esta cabecera. */
  columna: ColumnaOrden;
  /** Texto visible. */
  children: React.ReactNode;
  /** Alineación numérica, como el resto de la tabla. */
  numerica?: boolean;
};

/**
 * Cabecera de columna que ordena al pincharla. Escribe en la URL (`orden` y
 * `dir`) para que el enlace sea compartible, como los demás filtros.
 *
 * Al ordenar se vuelve a la página 1: si estabas en la página 4 y el orden
 * cambia, esa página puede no existir.
 */
function CabeceraOrdenableInner({ columna, children, numerica }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const actual = normalizarOrden(sp.get('orden') ?? undefined, sp.get('dir') ?? undefined);
  const activa = actual?.columna === columna;
  const flecha = activa ? (actual!.direccion === 'asc' ? '▲' : '▼') : '';

  function ordenar() {
    const siguiente = alternarOrden(actual, columna);
    const params = new URLSearchParams(sp.toString());
    params.set('orden', siguiente.columna);
    params.set('dir', siguiente.direccion);
    params.delete('pagina');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <th className={numerica ? 'td-num' : undefined} aria-sort={activa ? (actual!.direccion === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-orden${activa ? ' activa' : ''}`} onClick={ordenar}>
        {children}
        <span className="th-flecha" aria-hidden="true">{flecha}</span>
      </button>
    </th>
  );
}

export default function CabeceraOrdenable(props: Props) {
  return (
    <Suspense fallback={<th className={props.numerica ? 'td-num' : undefined}>{props.children}</th>}>
      <CabeceraOrdenableInner {...props} />
    </Suspense>
  );
}
