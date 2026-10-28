'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MODALIDADES_REUNION } from '@/lib/comercial/tipos';
import type { FiltroModalidad } from '@/lib/comercial/agenda';

type Props = {
  /** Cuántas reuniones hay de cada modalidad, sobre el total sin filtrar. */
  cuenta: Record<FiltroModalidad, number>;
};

/**
 * Filtro de modalidad del tablero de agenda.
 *
 * Escribe la modalidad en la URL, como el resto de filtros de la app, para que
 * el enlace sea compartible y el estado sobreviva a un refresco.
 *
 * Las cuentas son siempre sobre el total, no sobre lo filtrado: así se ve la
 * magnitud de lo que el filtro está ocultando sin tener que quitarlo.
 */
function FiltroModalidadInner({ cuenta }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const activa = (sp.get('modalidad') as FiltroModalidad | null) ?? 'todas';

  function elegir(valor: FiltroModalidad) {
    const params = new URLSearchParams(sp.toString());
    if (valor === 'todas') params.delete('modalidad');
    else params.set('modalidad', valor);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const opciones: { valor: FiltroModalidad; etiqueta: string }[] = [
    { valor: 'todas', etiqueta: 'Todas' },
    ...MODALIDADES_REUNION,
  ];

  return (
    <div className="filtro-agenda">
      <span className="rotulo">Modalidad</span>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          className={`opcion ${activa === o.valor ? 'activa' : ''}`}
          onClick={() => elegir(o.valor)}
          aria-pressed={activa === o.valor}
        >
          {o.etiqueta}
          <span className="cuenta">{cuenta[o.valor] ?? 0}</span>
        </button>
      ))}
      <button type="button" className="limpiar" onClick={() => elegir('todas')} disabled={activa === 'todas'}>
        Limpiar filtro
      </button>
    </div>
  );
}

export default function FiltroModalidad(props: Props) {
  return (
    <Suspense fallback={null}>
      <FiltroModalidadInner {...props} />
    </Suspense>
  );
}
