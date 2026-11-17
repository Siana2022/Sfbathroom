/** Esqueleto global mientras cargan los datos de la sección. */
export default function Loading() {
  return (
    <div>
      <div className="sk sk-titulo" />
      <div className="grid-kpis">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="kpi sk sk-kpi" />
        ))}
      </div>
      <div className="card">
        <div className="sk sk-subtitulo" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="sk sk-linea" />
        ))}
      </div>
      <div className="card">
        <div className="sk sk-subtitulo" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="sk sk-linea" />
        ))}
      </div>
    </div>
  );
}
