'use client';

import { useEffect, useState } from 'react';

type Frescura = {
  empresa: string;
  ultimaFactura: string | null;
};

function colorPara(fecha: Date | null): string {
  if (!fecha) return 'var(--rojo)';
  const dias = (Date.now() - fecha.getTime()) / 86400000;
  if (dias <= 7) return 'var(--verde)';
  if (dias <= 21) return 'var(--ambar)';
  return 'var(--rojo)';
}

export default function FrescuraDatos({ empresa }: { empresa: string }) {
  const [d, setD] = useState<Frescura | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let viva = true;
    setError(false);
    setD(null);
    fetch(`/api/frescura?empresa=${encodeURIComponent(empresa)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => {
        if (viva) setD(x);
      })
      .catch(() => {
        if (viva) setError(true);
      });
    return () => {
      viva = false;
    };
  }, [empresa]);

  const fecha = d?.ultimaFactura ? new Date(`${d.ultimaFactura}T00:00:00`) : null;
  const color = error || !fecha ? 'var(--rojo)' : colorPara(fecha);
  const texto = fecha
    ? `${fecha.getDate()} ${fecha.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}`
    : 'sin datos';

  return (
    <span
      title={fecha ? `Datos cargados hasta ${fecha.toLocaleDateString('es-ES')}` : 'Aún no hay facturas cargadas para esta empresa'}
      style={{ fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}
    >
      {empresa} · datos {texto}
    </span>
  );
}