import { cookies } from 'next/headers';
import { getCobros } from '@/lib/datos/cobros';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function CreditoCobroPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getCobros(empresa, ANIO);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 8</p>
      <h1>Crédito y cobro</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Saldo de clientes, DSO, aging de la deuda y vencidos de {d.empresa.nombre}.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Saldo total de clientes" valor={eur(d.saldoTotal)} nota={`de los que ${eur(d.vencido)} vencido`} />
        <Kpi etiqueta="Vencido total" valor={eur(d.vencido)} nota={`${numero(d.enCarteraFuturo)} en cartera, aún no vencido`} />
        <Kpi etiqueta="DSO real" valor={d.dso === null ? '—' : `${decimal(d.dso)} días`} nota="días de venta a cobrar" />
      </ul>

      <div className="card">
        <h2>Aging de la deuda</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Tramo</th>
              <th className="td-num">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {d.buckets.map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td className="td-num">{eur(b.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Saldo por cliente</h2>
        {d.porCliente.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin saldos pendientes.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Saldo</th>
                <th className="td-num">Vencido</th>
              </tr>
            </thead>
            <tbody>
              {d.porCliente.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{eur(c.saldo)}</td>
                  <td className={`td-num ${c.vencido > 0 ? 'td-pos' : ''}`}>{eur(c.vencido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}