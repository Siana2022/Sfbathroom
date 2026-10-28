'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Props = {
  pagina: number;
  totalPaginas: number;
  total: number;
  desde: number;
  hasta: number;
};

/** Números de página a mostrar, con elipsis si hay muchas. */
function numeros(pagina: number, totalPaginas: number): (number | '…')[] {
  if (totalPaginas <= 7) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  const salida: (number | '…')[] = [1];
  const desde = Math.max(2, pagina - 1);
  const hasta = Math.min(totalPaginas - 1, pagina + 1);
  if (desde > 2) salida.push('…');
  for (let i = desde; i <= hasta; i += 1) salida.push(i);
  if (hasta < totalPaginas - 1) salida.push('…');
  salida.push(totalPaginas);
  return salida;
}

function PaginacionInner({ pagina, totalPaginas, total, desde, hasta }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function ir(p: number) {
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete('pagina');
    else params.set('pagina', String(p));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (total === 0) return null;

  return (
    <div className="paginacion">
      <span className="resumen">
        Mostrando {desde}–{hasta} de {total}
      </span>
      {totalPaginas > 1 && (
        <div className="botones">
          <button type="button" onClick={() => ir(pagina - 1)} disabled={pagina <= 1} aria-label="Anterior">
            ‹
          </button>
          {numeros(pagina, totalPaginas).map((n, i) =>
            n === '…' ? (
              <button key={`e${i}`} type="button" disabled>
                …
              </button>
            ) : (
              <button
                key={n}
                type="button"
                className={n === pagina ? 'activo' : ''}
                onClick={() => ir(n)}
                aria-current={n === pagina ? 'page' : undefined}
              >
                {n}
              </button>
            ),
          )}
          <button type="button" onClick={() => ir(pagina + 1)} disabled={pagina >= totalPaginas} aria-label="Siguiente">
            ›
          </button>
        </div>
      )}
    </div>
  );
}

export default function Paginacion(props: Props) {
  return (
    <Suspense fallback={null}>
      <PaginacionInner {...props} />
    </Suspense>
  );
}
