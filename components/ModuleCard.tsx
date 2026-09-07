type Props = {
  titulo: string;
  estado: 'pendiente' | 'listo';
  descripcion: string;
  tablas: string[];
};

export default function ModuleCard({ titulo, estado, descripcion, tablas }: Props) {
  return (
    <div className="card">
      <span className={`badge ${estado}`}>{estado === 'listo' ? 'Estructura lista' : 'Pendiente de fuente de datos'}</span>
      <h2>{titulo}</h2>
      <p style={{ color: 'var(--muted)' }}>{descripcion}</p>
      <ul className="tablas">
        {tablas.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
