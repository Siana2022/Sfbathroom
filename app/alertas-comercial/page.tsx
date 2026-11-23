import { cookies } from 'next/headers';
import { getAlertasComercial } from '@/lib/datos/alertasComercial';
import AlertasLista from '@/components/AlertasLista';

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

      <AlertasLista alertas={d.alertas} />
    </div>
  );
}
