import Link from 'next/link';
import { cookies } from 'next/headers';
import { getCartera } from '@/lib/datos/comercial';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import Aviso from '@/components/Aviso';

export const dynamic = 'force-dynamic';

/** Mi cartera: la lista de trabajo diaria del comercial. */
export default async function ComercialPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getCartera(empresa);

  return (
    <div>
      <p className="breadcrumb">Acceso comercial</p>
      <h1>Mi cartera</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 820 }}>
        {d.contexto.comercialNombre ? <>Cartera de <strong>{d.contexto.comercialNombre}</strong>. </> : null}
        Clientes con sus contactos, su último pedido (días sin pedir) y la última interacción registrada.
        Ordenados por tiempo sin pedir: arriba están los que requieren una llamada.
      </p>

      {!d.contexto.puedeEscribir && (
        <Aviso tipo="info">
          Tu rol es de solo lectura en este módulo: puedes consultar la cartera, pero no registrar contactos ni interacciones.
        </Aviso>
      )}

      <ul className="grid-kpis">
        <Kpi etiqueta="Clientes en cartera" valor={numero(d.totales.clientes)} />
        <Kpi etiqueta="Con contacto registrado" valor={numero(d.totales.conContacto)} nota={`${d.totales.clientes - d.totales.conContacto} sin contacto`} />
        <Kpi etiqueta="Sin pedir > 60 días" valor={numero(d.totales.sinPedir60)} nota="candidatos a llamada" />
        <Kpi etiqueta="Sin interacción" valor={numero(d.totales.sinInteraccion)} nota="nunca se ha registrado contacto" />
      </ul>

      <div className="card">
        <h2>Cartera · {d.empresa.nombre}</h2>
        {d.filas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No hay clientes asignados a tu cartera.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Provincia</th>
                  <th className="td-num">Días sin pedir</th>
                  <th>Último pedido</th>
                  <th className="td-num">Pedidos 12m</th>
                  <th className="td-num">Importe 12m</th>
                  <th className="td-num">Contactos</th>
                  <th className="td-num">Interacciones</th>
                  <th>Última</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.filas.map((f) => (
                  <tr key={f.cliente_id}>
                    <td>{f.cliente}</td>
                    <td>{f.provincia ?? f.pais ?? '—'}</td>
                    <td className={`td-num ${f.diasSinPedir === null || f.diasSinPedir > 60 ? 'td-pos' : ''}`}>
                      {f.diasSinPedir === null ? 'sin pedidos' : numero(f.diasSinPedir)}
                    </td>
                    <td>{f.ultimoPedido ?? '—'}</td>
                    <td className="td-num">{numero(f.pedidos12m)}</td>
                    <td className="td-num">{eur(f.importe12m)}</td>
                    <td className="td-num">{f.contactos === 0 ? '—' : numero(f.contactos)}</td>
                    <td className="td-num">{f.interacciones === 0 ? '—' : numero(f.interacciones)}</td>
                    <td>{f.ultimaInteraccion ? f.ultimaInteraccion.slice(0, 10) : '—'}</td>
                    <td>
                      <Link href={`/comercial/clientes/${f.cliente_id}`}>Ficha</Link>
                    </td>
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
