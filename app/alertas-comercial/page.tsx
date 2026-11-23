import Link from 'next/link';
import { cookies } from 'next/headers';
import { getAlertasComercial } from '@/lib/datos/alertasComercial';

export default async function AlertasComercialPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getAlertasComercial(empresa);

  return (
    <div>
      <p className="breadcrumb">Mi trabajo</p>
      <h1>Mis alertas</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Avisos sobre tu cartera para anticiparte: clientes que dejan de comprar, caídas, mora,
        pedidos con entrega pasada, reuniones atrasadas y ritmo del objetivo.
      </p>

      <ul className="grid-kpis">
        <li className="kpi">
          <span className="kpi-etiqueta">Críticas</span>
          <strong className="kpi-valor" style={{ color: 'var(--rojo)' }}>{d.criticas}</strong>
          <span className="kpi-nota">requieren acción ya</span>
        </li>
        <li className="kpi">
          <span className="kpi-etiqueta">Avisos</span>
          <strong className="kpi-valor" style={{ color: 'var(--ambar)' }}>{d.avisos}</strong>
          <span className="kpi-nota">para revisar esta semana</span>
        </li>
      </ul>

      <div className="card">
        <h2>Alertas de tu cartera</h2>
        {d.alertas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin alertas. Todo al día.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Severidad</th>
                <th>Alerta</th>
                <th>Detalle</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.alertas.map((a, i) => (
                <tr key={`${a.tipo}-${i}`}>
                  <td>
                    <span className={`badge ${a.severidad === 'critico' ? 'construccion' : 'pendiente'}`}>
                      {a.severidad === 'critico' ? 'Crítica' : 'Aviso'}
                    </span>
                  </td>
                  <td>{a.titulo}</td>
                  <td style={{ color: 'var(--muted)' }}>{a.detalle}</td>
                  <td><Link href={a.enlace} className="enlace">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
