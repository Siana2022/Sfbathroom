export default function Home() {
  return (
    <div>
      <h1>Panel sfbathroom</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 640 }}>
        Estructura base creada en Supabase (esquema y RLS) y desplegada en Vercel. Cada módulo del menú
        muestra su estado: qué tablas existen ya y qué falta por conectar a la fuente de datos real (A3ERP,
        contabilidad, plataformas de marketing). Ver CLAUDE.md para el contexto completo.
      </p>
      <div className="card">
        <h2>Próximos pasos</h2>
        <ul className="tablas">
          <li>Montar autenticación real (Supabase Auth) — hoy no hay login</li>
          <li>Conectar A3ERP (SQL Server) vía workflow n8n nocturno</li>
          <li>Cargar costes de artículo para activar el cálculo de margen real</li>
          <li>Definir y cargar los KPIs financieros con el cliente</li>
          <li>Cargar histórico de inversión en marketing (Excel) para el MMM</li>
        </ul>
      </div>
    </div>
  );
}
