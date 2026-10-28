'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Selector de periodo del panel comercial.
 *
 * Escribe `desde` y `hasta` en la URL, igual que el resto de filtros de la app,
 * para que el enlace sea compartible y el estado sobreviva a un refresco.
 */
function SelectorFechasInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const desde = sp.get('desde') ?? '';
  const hasta = sp.get('hasta') ?? '';

  function setUrl(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [clave, valor] of Object.entries(patch)) {
      if (valor) params.set(clave, valor);
      else params.delete(clave);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  /** Atajos: lo que se usa el 90% de las veces. */
  function atajo(cual: 'mes' | 'trimestre' | 'anio' | '90d') {
    const hoy = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const y = hoy.getUTCFullYear();
    const m = hoy.getUTCMonth();
    if (cual === 'mes') {
      setUrl({ desde: iso(new Date(Date.UTC(y, m, 1))), hasta: iso(new Date(Date.UTC(y, m + 1, 0))) });
    } else if (cual === 'trimestre') {
      const inicioTrim = Math.floor(m / 3) * 3;
      setUrl({ desde: iso(new Date(Date.UTC(y, inicioTrim, 1))), hasta: iso(new Date(Date.UTC(y, inicioTrim + 3, 0))) });
    } else if (cual === 'anio') {
      setUrl({ desde: `${y}-01-01`, hasta: `${y}-12-31` });
    } else {
      setUrl({ desde: iso(new Date(Date.now() - 90 * 86400000)), hasta: iso(new Date()) });
    }
  }

  return (
    <div className="barra-filtros">
      <span className="barra-filtros-titulo">Periodo</span>

      <label className="campo-filtro">
        Desde
        <input type="date" value={desde} onChange={(e) => setUrl({ desde: e.target.value || undefined })} />
      </label>

      <label className="campo-filtro">
        Hasta
        <input type="date" value={hasta} onChange={(e) => setUrl({ hasta: e.target.value || undefined })} />
      </label>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="boton" type="button" onClick={() => atajo('mes')}>Este mes</button>
        <button className="boton" type="button" onClick={() => atajo('trimestre')}>Trimestre</button>
        <button className="boton" type="button" onClick={() => atajo('anio')}>Año</button>
        <button className="boton" type="button" onClick={() => atajo('90d')}>90 días</button>
      </div>

      <button className="boton" type="button" onClick={() => router.push(pathname)} disabled={!desde && !hasta}>
        Limpiar
      </button>
    </div>
  );
}

export default function SelectorFechas() {
  return (
    <Suspense fallback={null}>
      <SelectorFechasInner />
    </Suspense>
  );
}
