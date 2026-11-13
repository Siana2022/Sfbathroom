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
  formato: (v: number) => string;
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

export default function Tarta({ datos, formato, maximo = 8 }: Props) {
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

  // Una sola porción: anillo completo (el arco de 360º se degenera).
  const unica = porciones.length === 1;

  let angulo = -Math.PI / 2;
  const sectores = porciones.map((d, i) => {
    const inicio = angulo;
    const fin = angulo + (d.valor / total) * 2 * Math.PI;
    angulo = fin;
    return { ...d, inicio, fin, color: COLORES[i % COLORES.length] };
  });

  return (
    <div className="tarta">
      <svg
        className="tarta-svg"
        viewBox={`0 0 ${TAMANO} ${TAMANO}`}
        width="100%"
        style={{ maxWidth: 300 }}
        role="img"
        aria-label="Distribución por importe"
      >
        {unica ? (
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={(RADIO + RADIO_INTERIOR) / 2}
            fill="none"
            stroke={COLORES[0]}
            strokeWidth={RADIO - RADIO_INTERIOR}
          >
            <title>{`${sectores[0].etiqueta}: ${formato(sectores[0].valor)}`}</title>
          </circle>
        ) : (
          sectores.map((s) => {
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
              <path key={s.etiqueta} d={d} fill={s.color} className="tarta-sector">
                <title>{`${s.etiqueta}: ${formato(s.valor)}`}</title>
              </path>
            );
          })
        )}
      </svg>
      <ul className="tarta-leyenda">
        {sectores.map((d) => (
          <li key={d.etiqueta} title={`${d.etiqueta}: ${formato(d.valor)}`}>
            <i style={{ background: d.color }} />
            <span className="tarta-etiqueta">{d.etiqueta}</span>
            <span className="tarta-valor">{formato(d.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
