export default function Esqueleto({ filas = 6 }: { filas?: number }) {
  return (
    <div className="card" aria-busy="true" aria-live="polite">
      <div className="esqueleto-linea" style={{ width: '38%', height: 22 }} />
      <div className="esqueleto-linea" style={{ width: '60%' }} />
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="esqueleto-linea" style={{ width: `${92 - (i % 4) * 9}%` }} />
      ))}
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>Cargando…</p>
    </div>
  );
}
