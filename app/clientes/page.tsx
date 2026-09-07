import { cookies } from 'next/headers';
import { getClientes } from '@/lib/datos/clientes';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function ClientesPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getClientes(empresa, ANIO);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 5</p>
      <h1>Comportamiento de cliente</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Clientes activos, nuevos y perdidos de {d.empresa.nombre}, retención entre {ANIO - 1} y
        {d.anio}.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Clientes activos ${d.anio}`} valor={numero(d.activos)} nota={`en ${ANIO - 1}: ${d.activosPrevio}`} />
        <Kpi etiqueta="Tasa de retención" valor={d.retencion === null ? '—' : `${decimal(d.retencion)} %`} nota="siguen facturando año a año" />
        <Kpi etiqueta="Nuevos clientes" valor={numero(d.nuevos)} nota="no facturaron el año previo" />
        <Kpi etiqueta="Recuperados" valor={numero(d.recuperados)} nota="facturaron previo, no el actual" />
        <Kpi etiqueta="Clientes perdidos / inactivos" valor={numero(d.perdidos)} nota="estado marcado en el CRM" />
      </ul>

      <div className="card">
        <h2>Clientes por facturación {d.anio}</h2>
        {d.tabla.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin facturación en el ejercicio.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Facturación neta</th>
                <th className="td-num">Facturas</th>
                <th className="td-num">Ticket medio</th>
              </tr>
            </thead>
            <tbody>
              {d.tabla.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{eur(c.neta)}</td>
                  <td className="td-num">{numero(c.facturas)}</td>
                  <td className="td-num">{eur(c.ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}