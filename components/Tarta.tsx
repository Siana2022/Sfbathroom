'use client';
import { useState } from 'react';
import { eur } from '@/lib/formato';

const COLORES = [
  '#2f6f8f',
  '#7aa6c2',
  '#e0a458',
  '#c96a5a',
  '#6f9a7a',
  '#8a6fa8',
  '#b7cfdd',
  '#a9a9a9',
  '#4f8a8b',
  '#d08c60',
];

export type PorcionTarta = { etiqueta: string; valor: number };

type Props = {
  datos: PorcionTarta[];
  /** Máximo de porciones con nombre; el resto se agrupa en "Otros". */
  maximo?: number;
};

const TAMANO = 260;
const CENTRO = TAMANO / 2;
const RADIO = 112;
const RADIO_INTERIOR = 64;

function punto(radio: number, angulo: number): [number, number] {
  return [CENTRO + radio * Math.cos(angulo), CENTRO + radio * Math.sin(angulo)];
}

export default function Tarta({ datos, maximo = 8 }: Props) {
  const [activo, setActivo] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const limpios = datos.filter((d) => Number.isFinite(d.valor) && d.valor > 0);
  const ordenados = [...limpios].sort((a, b) => b.valor - a.valor);

  let porciones = ordenados;
  if (ordenados.length > maximo) {
    const cabeza = ordenados.slice(0, maximo - 1);
    const resto = ordenados.slice(maximo - 1).reduce((s, d) => s + d.valor, 0);
    porciones = [...cabeza, { etiqueta: 'Otros', valor: resto }];
  }

  const total = porciones.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) {
    return <p style={{ color: 'var(--muted)' }}>Sin datos para el gráfico.</p>;
  }

  const unica = porciones.length === 1;

  let angulo = -Math.PI / 2;
  const sectores = porciones.map((d, i) => {
    const inicio = angulo;
    const fin = angulo + (d.valor / total) * 2 * Math.PI;
    angulo = fin;
    return { ...d, inicio, fin, color: COLORES[i % COLORES.length] };
  });

  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className="tarta">
      <div className="tarta-fila">
        <div className="tarta-lienzo" onMouseMove={mover} onMouseLeave={() => setActivo(null)}>
          <svg viewBox={`0 0 ${TAMANO} ${TAMANO}`} className="tarta-svg" role="img" aria-label="Distribución por importe">
            {unica ? (
              <circle
                cx={CENTRO}
                cy={CENTRO}
                r={(RADIO + RADIO_INTERIOR) / 2}
                fill="none"
                stroke={COLORES[0]}
                strokeWidth={RADIO - RADIO_INTERIOR}
                onMouseEnter={() => setActivo(0)}
              />
            ) : (
              sectores.map((s, i) => {
                const grande = s.fin - s.inicio > Math.PI ? 1 : 0;
                const [x1, y1] = punto(RADIO, s.inicio);
                const [x2, y2] = punto(RADIO, s.fin);
                const [x3, y3] = punto(RADIO_INTERIOR, s.fin);
                const [x4, y4] = punto(RADIO_INTERIOR, s.inicio);
                const d = [
                  `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
                  `A ${RADIO} ${RADIO} 0 ${grande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
                  `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
                  `A ${RADIO_INTERIOR} ${RADIO_INTERIOR} 0 ${grande} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
                  'Z',
                ].join(' ');
                return (
                  <path
                    key={s.etiqueta}
                    d={d}
                    fill={s.color}
                    className="tarta-sector"
                    fillOpacity={activo === null || activo === i ? 1 : 0.45}
                    onMouseEnter={() => setActivo(i)}
                  />
                );
              })
            )}
          </svg>
          {activo !== null && (
            <div className="tarta-tooltip" style={{ left: pos.x, top: pos.y }}>
              <strong>{sectores[activo].etiqueta}</strong>
              <span> · {eur(sectores[activo].valor)}</span>
            </div>
          )}
        </div>

        <ul className="tarta-leyenda">
          {sectores.map((s, i) => (
            <li
              key={s.etiqueta}
              className={activo === i ? 'activo' : undefined}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
            >
              <i style={{ background: s.color }} />
              <span className="tarta-etiqueta">{s.etiqueta}</span>
              <span className="tarta-valor">{eur(s.valor)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
