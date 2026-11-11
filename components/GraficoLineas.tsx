export type PuntoLinea = { etiqueta: string; cur: number | null; prev: number | null };

type Props = {
  series: PuntoLinea[];
  formato: (v: number) => string;
  leyenda?: { a: string; b?: string };
};

const W = 720;
const H = 280;
const PAD_L = 64;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 40;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const COLOR_A = '#c0392b';
const COLOR_B = '#9aa0a6';

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
  const n = series.length;
  const valores = series.flatMap((s) => [s.cur, s.prev]).filter((v): v is number => v != null && Number.isFinite(v));
  const maxReal = valores.length ? Math.max(...valores) : 0;
  const minReal = valores.length ? Math.min(0, ...valores) : 0;
  const maxY = maxReal <= 0 ? 1 : maxReal * 1.12;
  const minY = minReal < 0 ? minReal * 1.12 : 0;
  const rango = maxY - minY || 1;

  const x = (i: number) => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (PLOT_W * i) / (n - 1));
  const y = (v: number) => PAD_T + PLOT_H * (1 - (v - minY) / rango);

  const lineas = [4, 3, 2, 1, 0].map((k) => minY + (rango * k) / 4);

  const curVals = series.map((s) => s.cur);
  const prevVals = series.map((s) => s.prev);
  const hayDatos = valores.length > 0;

  const poli = (vals: (number | null)[]) =>
    segmentos(vals).map((seg) => seg.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));

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
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ maxWidth: '100%', height: 'auto' }}>
          {lineas.map((val, idx) => {
            const yy = y(val);
            return (
              <g key={idx}>
                <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD_L - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                  {formato(val)}
                </text>
              </g>
            );
          })}

          {/* Año anterior (línea discontinua) */}
          {poli(prevVals).map((pts, i) => (
            <polyline key={`p${i}`} points={pts} fill="none" stroke={COLOR_B} strokeWidth={2} strokeDasharray="5 4" />
          ))}
          {series.map((s, i) => s.prev != null ? (
            <circle key={`pc${i}`} cx={x(i)} cy={y(s.prev)} r={2.5} fill={COLOR_B} />
          ) : null)}

          {/* Año en curso */}
          {poli(curVals).map((pts, i) => (
            <polyline key={`c${i}`} points={pts} fill="none" stroke={COLOR_A} strokeWidth={2.5} />
          ))}
          {series.map((s, i) => s.cur != null ? (
            <rect key={`cc${i}`} x={x(i) - 3} y={y(s.cur) - 3} width={6} height={6} fill={COLOR_A}>
              <title>{`${s.etiqueta}: ${formato(s.cur)}`}</title>
            </rect>
          ) : null)}

          {/* Etiquetas eje X */}
          {series.map((s, i) => (
            <text key={`x${i}`} x={x(i)} y={H - PAD_B + 18} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {s.etiqueta}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
