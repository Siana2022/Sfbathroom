import Link from 'next/link';
import { bloques } from '@/lib/bloques';

export default function Home() {
  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Resumen</p>
      <h1>Panel sfbathroom</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Cuadro de mando comercial según la especificación del cliente. Los 11 bloques están
        definidos; cada página indica los indicadores que incluirá. La navegación respeta el rol
        conectado y la empresa seleccionada en la cabecera.
      </p>

      <div className="grid-bloques">
        {bloques.map((b) => (
          <Link key={b.slug} href={b.slug} className="card bloque-card">
            <span className="badge construccion">Bloque {b.numero}</span>
            <h3>{b.titulo}</h3>
            <p>{b.resumen}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}