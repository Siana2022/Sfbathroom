'use client';
import { useState } from 'react';

export type PuntoLinea = { etiqueta: string; cur: number | null; prev: number | null };

type Props = {
  series: PuntoLinea[];
  formato: (v: number) => string;
  leyenda?: { a: string; b?: string };
};

const W = 760;
const H = 300;
const PAD_L = 68;
const PAD_R = 22;
const PAD_T = 18;
const PAD_B = 34;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

// Serie 1 (azul) de la paleta validada; comparativa en gris.
const COLOR_A = '#2a78d6';
const COLOR_B = '#9a9a93';

function segmentos(vals: (number | null)[]): [number, number][][] {
  const segs: [number, number][][] = [];
  let actual: [number, number][] = [];
  vals.forEach((v, i) => {
    if (v == null) {
      if (actual.length) segs.push(actual);
      actual = [];
    } else {
      actual.push([i, v]);
    }
  });
  if (actual.length) segs.push(actual);
  return segs;
}

export default function GraficoLineas({ series, formato, leyenda }: Props) {
  const [hi, setHi] = useState<number | null>(null);
  const n = series.length;
  const valores = series.flatMap((s) => [s.cur, s.prev]).filter((v): v is number => v != null && Number.isFinite(v));
  const hayDatos = valores.length > 0;
  const maxReal = hayDatos ? Math.max(...valores) : 0;
  const minReal = hayDatos ? Math.min(0, ...valores) : 0;
  const maxY = maxReal <= 0 ? 1 : maxReal * 1.1;
  const minY = minReal < 0 ? minReal * 1.1 : 0;
  const rango = maxY - minY || 1;

  const x = (i: number) => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (PLOT_W * i) / (n - 1));
  const y = (v: number) => PAD_T + PLOT_H * (1 - (v - minY) / rango);
  const banda = n > 1 ? PLOT_W / (n - 1) : PLOT_W;

  const lineasY = [4, 3, 2, 1, 0].map((k) => minY + (rango * k) / 4);
  const curVals = series.map((s) => s.cur);
  const prevVals = series.map((s) => s.prev);

  const poli = (vals: (number | null)[]) =>
    segmentos(vals).map((seg) => seg.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));

  const act = hi != null ? series[hi] : null;
  const tipW = 150;
  const tipLineas = act
    ? [
        { c: COLOR_A, t: `${leyenda?.a ?? 'Actual'}: ${act.cur != null ? formato(act.cur) : '—'}` },
        ...(leyenda?.b ? [{ c: COLOR_B, t: `${leyenda.b}: ${act.prev != null ? formato(act.prev) : '—'}` }] : []),
      ]
    : [];
  const tipH = 20 + tipLineas.length * 18;
  const tipX = hi != null ? (x(hi) + tipW + 14 > W - PAD_R ? x(hi) - tipW - 12 : x(hi) + 12) : 0;

  return (
    <div>
      {leyenda ? (
        <div className="barras-leyenda">
          <span><i className="chip" style={{ background: COLOR_A }} /> {leyenda.a}</span>
          {leyenda.b ? <span><i className="chip" style={{ background: COLOR_B }} /> {leyenda.b}</span> : null}
        </div>
      ) : null}

      {!hayDatos ? (
        <p style={{ color: 'var(--muted)', padding: '24px 0' }}>No hay serie disponible para este KPI todavía.</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          style={{ maxWidth: '100%', height: 'auto' }}
          onMouseLeave={() => setHi(null)}
        >
          {/* Rejilla + etiquetas eje Y */}
          {lineasY.map((val, idx) => {
            const yy = y(val);
            return (
              <g key={idx}>
                <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD_L - 10} y={yy + 4} textAnchor="end" fontSize={11.5} fill="var(--muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formato(val)}
                </text>
              </g>
            );
          })}

          {/* Crosshair del punto activo */}
          {hi != null ? (
            <line x1={x(hi)} y1={PAD_T} x2={x(hi)} y2={PAD_T + PLOT_H} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          ) : null}

          {/* Año anterior (discontinua) */}
          {poli(prevVals).map((pts, i) => (
            <polyline key={`p${i}`} points={pts} fill="none" stroke={COLOR_B} strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {/* Año en curso */}
          {poli(curVals).map((pts, i) => (
            <polyline key={`c${i}`} points={pts} fill="none" stroke={COLOR_A} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* Puntos (pequeños; se agrandan en el mes activo) */}
          {series.map((s, i) => (
            <g key={`pt${i}`}>
              {s.prev != null ? <circle cx={x(i)} cy={y(s.prev)} r={hi === i ? 4 : 2.2} fill={COLOR_B} stroke="var(--panel)" strokeWidth={hi === i ? 1.5 : 0} /> : null}
              {s.cur != null ? <circle cx={x(i)} cy={y(s.cur)} r={hi === i ? 4.5 : 2.6} fill={COLOR_A} stroke="var(--panel)" strokeWidth={hi === i ? 1.5 : 0} /> : null}
            </g>
          ))}

          {/* Etiquetas eje X */}
          {series.map((s, i) => (
            <text key={`x${i}`} x={x(i)} y={H - PAD_B + 20} textAnchor="middle" fontSize={11.5} fill="var(--muted)">
              {s.etiqueta}
            </text>
          ))}

          {/* Tooltip */}
          {act ? (
            <g pointerEvents="none">
              <rect x={tipX} y={PAD_T + 2} width={tipW} height={tipH} rx={8} fill="var(--panel)" stroke="var(--border)" strokeWidth={1} style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))' }} />
              <text x={tipX + 12} y={PAD_T + 20} fontSize={12.5} fontWeight={600} fill="currentColor">{act.etiqueta}</text>
              {tipLineas.map((l, k) => (
                <g key={k}>
                  <circle cx={tipX + 16} cy={PAD_T + 36 + k * 18} r={4} fill={l.c} />
                  <text x={tipX + 26} y={PAD_T + 40 + k * 18} fontSize={12} fill="var(--muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{l.t}</text>
                </g>
              ))}
            </g>
          ) : null}

          {/* Capa de detección de hover (una banda por mes) */}
          {series.map((s, i) => (
            <rect
              key={`h${i}`}
              x={x(i) - banda / 2}
              y={PAD_T}
              width={banda}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHi(i)}
              onMouseMove={() => setHi(i)}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
