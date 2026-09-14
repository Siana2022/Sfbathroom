'use client';

import { useEffect, useState } from 'react';

type Frescura = {
  haceMin: number | null;
  staleness: string;
  ultimaFactura: string | null;
};

export default function FrescuraDatos() {
  const [d, setD] = useState<Frescura | null>(null);

  useEffect(() => {
    fetch('/api/frescura', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setD(x))
      .catch(() => setD(null));
  }, []);

  if (!d) return null;
  const { haceMin, staleness } = d;
  const color = staleness === 'al-dia' ? 'var(--verde)' : staleness === 'aviso' ? 'var(--ambar)' : 'var(--rojo)';
  const etiqueta =
    haceMin == null ? 'Datos: sin job' : haceMin < 90 ? `Datos al día (hace ${haceMin} min)` : haceMin < 1440 ? `Datos de hace ${Math.round(haceMin / 60)} h` : `Datos atrasados (${Math.round(haceMin / 60)} h)`;

  return (
    <span
      title={d.ultimaFactura ? `Última factura en BD: ${d.ultimaFactura}` : 'Sin datos'}
      style={{ fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}
    >
      {etiqueta}
    </span>
  );
}