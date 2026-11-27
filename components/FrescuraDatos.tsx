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

function textoFecha(fecha: Date): string {
  return `${fecha.getDate()} ${fecha.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}`;
}

/**
 * Píldora de frescura de datos.
 *
 * Con una empresa muestra «SF · datos 27 nov». Con varias (el comercial ve las tres
 * en la agenda fusionada) muestra la **más antigua**, que es la que avisa del riesgo.
 */
export default function FrescuraDatos({ empresa }: { empresa: string | string[] }) {
  const empresas = Array.isArray(empresa) ? empresa : [empresa];
  const clave = empresas.join(',');
  const [datos, setDatos] = useState<Frescura[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let viva = true;
    setError(false);
    setDatos([]);
    Promise.all(
      empresas.map((e) =>
        fetch(`/api/frescura?empresa=${encodeURIComponent(e)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? (r.json() as Promise<Frescura>) : null))
          .catch(() => null),
      ),
    ).then((lista) => {
      if (!viva) return;
      const validas = lista.filter((x): x is Frescura => x !== null);
      if (validas.length === 0) setError(true);
      setDatos(validas);
    });
    return () => {
      viva = false;
    };
    // `clave` resume el array; evita repetir la petición en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // La más antigua manda; si alguna no tiene datos, esa es la que se muestra.
  const peor = datos.reduce<Frescura | null>((acc, d) => {
    if (!acc) return d;
    if (!d.ultimaFactura) return d;
    if (!acc.ultimaFactura) return acc;
    return d.ultimaFactura < acc.ultimaFactura ? d : acc;
  }, null);

  const fecha = peor?.ultimaFactura ? new Date(`${peor.ultimaFactura}T00:00:00`) : null;
  const color = error || !fecha ? 'var(--rojo)' : colorPara(fecha);
  const texto = fecha ? textoFecha(fecha) : 'sin datos';
  const unaSola = empresas.length === 1;
  const etiqueta = unaSola ? `${empresas[0]} · datos ${texto}` : `datos ${texto}`;
  const detalle = datos.length
    ? datos.map((d) => `${d.empresa}: ${d.ultimaFactura ? textoFecha(new Date(`${d.ultimaFactura}T00:00:00`)) : 'sin datos'}`).join(' · ')
    : 'Sin datos de frescura';

  return (
    <span
      title={unaSola
        ? fecha
          ? `Datos cargados hasta ${fecha.toLocaleDateString('es-ES')}`
          : 'Aún no hay facturas cargadas para esta empresa'
        : `${detalle}\nSe muestra la empresa más atrasada.`}
      style={{ fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}
    >
      {etiqueta}
    </span>
  );
}
