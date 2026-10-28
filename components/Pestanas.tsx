'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type Pestana = 'cartera' | 'agenda' | 'seguimiento' | 'contactos';

export const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'cartera', etiqueta: 'Cartera' },
  { valor: 'agenda', etiqueta: 'Agenda' },
  { valor: 'seguimiento', etiqueta: 'Seguimiento' },
  { valor: 'contactos', etiqueta: 'Contactos' },
];

type Props = {
  cuenta: Record<Pestana, number>;
};

/**
 * Pestañas del acceso comercial.
 *
 * El estado vive en la URL (`?vista=`), no en el componente: así el enlace a
 * una pestaña concreta se puede compartir y el refresco no devuelve al
 * comercial a la primera pestaña.
 */
function PestanasInner({ cuenta }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const activa = (sp.get('vista') as Pestana | null) ?? 'cartera';

  function elegir(valor: Pestana) {
    const params = new URLSearchParams(sp.toString());
    if (valor === 'cartera') params.delete('vista');
    else params.set('vista', valor);
    // Al cambiar de pestaña se limpia la página del listado: la paginación de
    // una pestaña no tiene sentido en otra.
    params.delete('pagina');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="pestanas" role="tablist">
      {PESTANAS.map((p) => (
        <button
          key={p.valor}
          type="button"
          role="tab"
          aria-selected={activa === p.valor}
          className={activa === p.valor ? 'activo' : ''}
          onClick={() => elegir(p.valor)}
        >
          {p.etiqueta}
          <span className="cuenta">{cuenta[p.valor] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export default function Pestanas(props: Props) {
  return (
    <Suspense fallback={null}>
      <PestanasInner {...props} />
    </Suspense>
  );
}
