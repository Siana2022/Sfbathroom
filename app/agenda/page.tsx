import Link from 'next/link';
import { cookies } from 'next/headers';
import { getAgenda, getAgendaTodas } from '@/lib/datos/agenda';
import { getUsuario } from '@/lib/datos/role';
import AgendaComercial from '@/components/AgendaComercial';

export default async function AgendaPage({ searchParams }: { searchParams: { cliente?: string } }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  // El comercial ve su agenda de las tres empresas a la vez, sin selector.
  const usuario = await getUsuario();
  const datos = usuario?.rol === 'comercial' ? await getAgendaTodas() : await getAgenda(empresa);

  return (
    <div>
      <p className="breadcrumb">Mi trabajo</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Mi agenda</h1>
          <p style={{ color: 'var(--muted)', maxWidth: 760, margin: 0 }}>
            Visitas, llamadas y tareas de tu cartera. Lo que marques como hecho pasa al historial.
          </p>
        </div>
        <Link href="/configuracion/plantillas-reunion" className="boton">Plantillas de reunión</Link>
      </div>
      <AgendaComercial datos={datos} clienteInicial={searchParams?.cliente ?? null} />
    </div>
  );
}
