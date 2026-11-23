import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getEventoAgenda, getAgendaContexto } from '@/lib/datos/agenda';
import DetalleReunion from '@/components/DetalleReunion';

export default async function ReunionPage({ params }: { params: { id: string } }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const [evento, ctx] = await Promise.all([getEventoAgenda(params.id), getAgendaContexto(empresa)]);
  if (!evento) notFound();

  return (
    <div>
      <p className="breadcrumb">Mi agenda</p>
      <h1>{evento.asunto}</h1>
      <DetalleReunion evento={evento} empresaId={ctx.empresaId} comercialId={ctx.comercialId} />
    </div>
  );
}
