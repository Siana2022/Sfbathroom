import { createClient } from '@/lib/supabase/server';

export default async function BajasPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('email_bajas')
    .select('email, motivo, fecha')
    .order('fecha', { ascending: false })
    .limit(1000);

  const bajas = (data ?? []) as { email: string; motivo: string | null; fecha: string }[];

  return (
    <div>
      <p className="breadcrumb">Marketing · Email</p>
      <h1>Bajas de correo</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Estas direcciones quedan excluidas automáticamente de todas las campañas.
      </p>
      <div className="card">
        <h2>{bajas.length} direcciones</h2>
        {bajas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Todavía no hay bajas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr><th>Email</th><th>Motivo</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {bajas.map((b) => (
                <tr key={b.email}>
                  <td>{b.email}</td>
                  <td>{b.motivo ?? '—'}</td>
                  <td>{b.fecha.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
