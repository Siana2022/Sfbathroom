export type Barra = {
  etiqueta: string;
  valor: number;
  valor2?: number | null;
  titulo: string;
};

type Props = {
  series: Barra[];
  formato: (v: number) => string;
  leyenda?: { a: string; b?: string };
};

export default function GraficoBarras({ series, formato, leyenda }: Props) {
  const max = Math.max(1, ...series.map((s) => Math.max(s.valor, s.valor2 ?? 0)));
  return (
    <div>
      {leyenda ? (
        <div className="barras-leyenda">
          <span>
            <i className="chip chip-a" /> {leyenda.a}
          </span>
          {leyenda.b ? (
            <span>
              <i className="chip chip-b" /> {leyenda.b}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="barras">
        {series.map((s) => (
          <div className="barra-col" key={s.etiqueta}>
            <div
              className="barras-ejes"
              role="img"
              aria-label={s.titulo}
              title={`${s.titulo} · ${formato(s.valor)}`}
            >
              <div className="barra-valor" style={{ height: `${max > 0 ? (s.valor / max) * 100 : 0}%` }} />
              {s.valor2 != null ? (
                <div className="barra-valor2" style={{ height: `${max > 0 ? (s.valor2 / max) * 100 : 0}%` }} />
              ) : null}
            </div>
            <span className="barra-etiqueta">{s.etiqueta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}