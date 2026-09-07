import { cookies } from 'next/headers';
import { getAlertas } from '@/lib/datos/alertas';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

const SEVERIDAD: Record<string, string> = {
  ok: 'badge listo',
  aviso: 'badge pendiente',
  critico: 'badge construccion',
};

export default async function AlertasPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getAlertas(empresa, ANIO);
  const criticas = d.senales.filter((s) => s.severidad === 'critico').length;

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 11</p>
      <h1>Alertas</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Avisos por umbral sobre los datos de {d.empresa.nombre}: fuga de clientes, rotura de stock,
        margen bajo objetivo, DSO al alza, vencidos y desviación de presupuesto.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Señales críticas" valor={numero(criticas)} nota={`de ${d.senales.length} señales evaluadas`} />
        <Kpi etiqueta="Reglas configuradas" valor={numero(d.config.length)} nota="activas" />
      </ul>

      <div className="card">
        <h2>Señales</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Señal</th>
              <th className="td-num">Valor</th>
              <th>Severidad</th>
            </tr>
          </thead>
          <tbody>
            {d.senales.map((s) => (
              <tr key={s.etiqueta}>
                <td>{s.etiqueta}</td>
                <td className="td-num">{s.valor}</td>
                <td>
                  <span className={SEVERIDAD[s.severidad]}>
                    {s.severidad === 'ok' ? 'OK' : s.severidad === 'aviso' ? 'Aviso' : 'Crítico'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Alertas generadas</h2>
        {d.generadas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Aún no se han registrado alertas automáticas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Referencia</th>
                <th className="td-num">Importe</th>
                <th>Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {d.generadas.map((g) => (
                <tr key={g.id}>
                  <td>{g.fecha.slice(0, 10)}</td>
                  <td>{g.referencia ?? '—'}</td>
                  <td className="td-num">{g.importe === null ? '—' : eur(g.importe)}</td>
                  <td>{g.mensaje ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}