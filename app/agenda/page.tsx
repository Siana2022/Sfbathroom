import { cookies } from 'next/headers';
import { getAgenda } from '@/lib/datos/agenda';
import AgendaComercial from '@/components/AgendaComercial';

export default async function AgendaPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const datos = await getAgenda(empresa);

  return (
    <div>
      <p className="breadcrumb">Mi trabajo</p>
      <h1>Mi agenda</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Visitas, llamadas y tareas de tu cartera. Lo que marques como hecho pasa al historial.
      </p>
      <AgendaComercial datos={datos} />
    </div>
  );
}
