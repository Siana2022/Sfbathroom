import { bloques } from '@/lib/bloques';

type Props = {
  slugHref: string;
};

export default function PaginaBloque({ slugHref }: Props) {
  const bloque = bloques.find((b) => b.slug === slugHref) ?? null;

  if (!bloque) {
    return (
      <div>
        <h1>Bloque no encontrado</h1>
        <p style={{ color: 'var(--muted)' }}>Este bloque no está definido en la configuración del cuadro de mando.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque {bloque.numero}</p>
      <h1>{bloque.titulo}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>{bloque.resumen}</p>

      <div className="card">
        <span className="badge construccion">En construcción</span>
        <h2>Indicadores que incluirá</h2>
        <ul className="grid-kpis">
          {bloque.metricas.map((m) => (
            <li key={m} className="kpi">
              {m}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Datos previstos</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Este bloque leerá de Supabase con la RLS del rol conectado y de la empresa seleccionada.
          Está pendiente de conectar la fuente real (A3ERP / importaciones) y de construir las consultas
          del bloque.
        </p>
      </div>
    </div>
  );
}