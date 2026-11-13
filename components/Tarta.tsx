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

  let acumulado = 0;
  const paradas = porciones.map((d, i) => {
    const inicio = (acumulado / total) * 100;
    acumulado += d.valor;
    const fin = (acumulado / total) * 100;
    return `${COLORES[i % COLORES.length]} ${inicio}% ${fin}%`;
  });

  return (
    <div className="tarta">
      <div
        className="tarta-circulo"
        style={{ background: `conic-gradient(${paradas.join(', ')})` }}
        role="img"
        aria-label={`Distribución de ${porciones.length} conceptos`}
      >
        <div className="tarta-hueco" />
      </div>
      <ul className="tarta-leyenda">
        {porciones.map((d, i) => (
          <li key={d.etiqueta}>
            <i style={{ background: COLORES[i % COLORES.length] }} />
            <span className="tarta-etiqueta" title={d.etiqueta}>
              {d.etiqueta}
            </span>
            <span className="tarta-valor">{formato(d.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
