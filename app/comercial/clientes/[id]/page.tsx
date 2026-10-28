import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getFichaComercial, getContextoComercial } from '@/lib/datos/comercial';
import { getReunionesCliente } from '@/lib/datos/panelComercial';
import { ETIQUETA_TIPO } from '@/lib/comercial/tipos';
import { porDefectoReunion } from '@/lib/comercial/agenda';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import ListaContactos from '@/components/ListaContactos';
import ListaReuniones from '@/components/ListaReuniones';
import ListaHitos from '@/components/ListaHitos';
import SelectorEstadoCrm from '@/components/SelectorEstadoCrm';
import FormInteraccion from '@/components/FormInteraccion';
import FormReunion from '@/components/FormReunion';
import ResumenIA from '@/components/ResumenIA';

export const dynamic = 'force-dynamic';

/** Ficha comercial: contactos, agenda, histórico de conversaciones y pedidos. */
export default async function FichaComercialPage({ params }: { params: { id: string } }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const [d, contexto, reuniones] = await Promise.all([
    getFichaComercial(empresa, params.id),
    getContextoComercial(),
    getReunionesCliente(empresa, params.id),
  ]);
  if (!d) notFound();

  const proximas = reuniones.filter((r) => r.estado === 'programada');
  const pasadas = reuniones.filter((r) => r.estado !== 'programada');

  const ultimoResumen = d.interacciones.find((i) => i.resumen_ia)?.resumen_ia ?? null;
  const ultimasConclusiones = d.interacciones.find((i) => i.conclusiones_ia)?.conclusiones_ia ?? null;

  return (
    <div>
      <p className="breadcrumb">
        <Link href="/comercial">Acceso comercial</Link> · Ficha
      </p>
      <h1>{d.cliente.nombre}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 820 }}>
        {d.cliente.codigoErp && <>Ref. {d.cliente.codigoErp} · </>}
        {[d.cliente.provincia, d.cliente.pais].filter(Boolean).join(', ')}
        {d.cliente.comercial && <> · Comercial: {d.cliente.comercial}</>}
        {d.cliente.telefono && <> · Tel. {d.cliente.telefono}</>}
        {d.cliente.email && <> · {d.cliente.email}</>}
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 4px' }}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Estado CRM:</span>
        <SelectorEstadoCrm
          clienteId={d.cliente.id}
          estadoActual={d.cliente.estadoCrm}
          motivoActual={d.cliente.motivoPerdida}
          editable={contexto.puedeEscribir}
        />
        {d.cliente.estadoCrm === 'perdido' && d.cliente.motivoPerdida && (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>Motivo: {d.cliente.motivoPerdida}</span>
        )}
      </div>

      <ul className="grid-kpis">
        <Kpi etiqueta="Días sin pedir" valor={d.diasSinPedir === null ? 'sin pedidos' : numero(d.diasSinPedir)} />
        <Kpi etiqueta="Pedidos registrados" valor={numero(d.pedidos.length)} />
        <Kpi etiqueta="Contactos" valor={numero(d.contactos.length)} />
        <Kpi etiqueta="Interacciones" valor={numero(d.interacciones.length)} />
      </ul>

      <ListaContactos
        clienteId={d.cliente.id}
        empresaCodigo={empresa}
        contactos={d.contactos}
        contactoHabitualId={d.cliente.contactoHabitualId}
        editable={contexto.puedeEscribir}
      />

      <ListaHitos
        clienteId={d.cliente.id}
        empresaCodigo={empresa}
        hitos={d.hitos}
        editable={contexto.puedeEscribir}
      />

      {contexto.puedeEscribir && (
        <div className="card">
          <h2>Agendar reunión</h2>
          <FormReunion
            clienteId={d.cliente.id}
            empresaCodigo={empresa}
            contactos={d.contactos}
            porDefecto={porDefectoReunion()}
          />
        </div>
      )}

      <div className="card">
        <h2>Agenda</h2>
        {proximas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin reuniones programadas con este cliente.</p>
        ) : (
          <ListaReuniones
            reuniones={proximas}
            editable={contexto.puedeEscribir}
          />
        )}
        {pasadas.length > 0 && (
          <>
            <h3 style={{ marginTop: 18, fontSize: 14, color: 'var(--muted)' }}>Reuniones cerradas</h3>
            <ListaReuniones reuniones={pasadas} />
          </>
        )}
      </div>

      {contexto.puedeEscribir && (
        <div className="card">
          <h2>Registrar interacción</h2>
          <FormInteraccion clienteId={d.cliente.id} empresaCodigo={empresa} contactos={d.contactos} />
        </div>
      )}

      <div className="card">
        <h2>Histórico de conversaciones</h2>
        {d.interacciones.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin interacciones registradas todavía.</p>
        ) : (
          <>
            <ResumenIA
              clienteId={d.cliente.id}
              resumenGuardado={ultimoResumen}
              conclusionesGuardadas={ultimasConclusiones}
            />
            <ul className="tablas" style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
              {d.interacciones.map((i) => (
                <li key={i.id} style={{ padding: '10px 0', borderTop: '1px solid var(--borde, #e5e5e5)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge">{ETIQUETA_TIPO[i.tipo] ?? i.tipo}</span>
                    <strong>{i.fecha.slice(0, 10)}</strong>
                    {i.asunto && <span>{i.asunto}</span>}
                    {i.resultado && <span className="badge">{i.resultado}</span>}
                    {i.duracion_min !== null && <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{i.duracion_min} min</span>}
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{i.contenido}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="card">
        <h2>Pedidos</h2>
        {d.pedidos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin pedidos volcados de A3ERP para este cliente.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th className="td-num">Importe</th>
                  <th className="td-num">Hace (días)</th>
                </tr>
              </thead>
              <tbody>
                {d.pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.numero ?? '—'}</td>
                    <td>{p.fecha}</td>
                    <td>{p.estado ?? '—'}</td>
                    <td className="td-num">{eur(p.importe)}</td>
                    <td className="td-num">{numero(p.diasSinPedir)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
