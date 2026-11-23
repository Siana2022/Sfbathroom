import { cookies } from 'next/headers';
import { getAlertasComercial } from '@/lib/datos/alertasComercial';
import AlertasPanel from '@/components/AlertasPanel';

export default async function AlertasComercialPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getAlertasComercial(empresa);

  return (
    <div>
      <p className="breadcrumb">Mi trabajo</p>
      <h1>Mis alertas</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Avisos sobre tu cartera para anticiparte: clientes que dejan de comprar, caídas, mora,
        pedidos con entrega pasada, reuniones atrasadas y ritmo del objetivo. Pincha una tarjeta
        para ver el detalle.
      </p>

      <AlertasPanel alertas={d.alertas} empresaId={d.empresaId} comercialId={d.comercialId} />
    </div>
  );
}
