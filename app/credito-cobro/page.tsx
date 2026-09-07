import { cookies } from 'next/headers';
import { getCobros } from '@/lib/datos/cobros';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function CreditoCobroPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getCobros(empresa, ANIO, filtros);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 8</p>
      <h1>Crédito y cobro</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Saldo de clientes, DSO, aging de la deuda y vencidos de {d.empresa.nombre}.
      </p>

      <Filtros opciones={opciones} />

      <ul className="grid-kpis">
        <Kpi etiqueta="Saldo total de clientes" valor={eur(d.saldoTotal)} nota={`de los que ${eur(d.vencido)} vencido`} />
        <Kpi etiqueta="Vencido total" valor={eur(d.vencido)} nota={`${numero(d.enCarteraFuturo)} en cartera, aún no vencido`} />
        <Kpi etiqueta="DSO real" valor={d.dso === null ? '—' : `${decimal(d.dso)} días`} nota="días de venta a cobrar" />
        <Kpi
          etiqueta="Desvío DSO vs 30 días pactados"
          valor={d.dsoDesvioDias > 0 ? `${decimal(d.dsoDesvioDias)} días` : 'al día'}
          nota={d.dsoDesvioDias > 0 ? `${eur(d.dsoDesvioEuros)} de circulante atrapado` : 'sin capital inmovilizado por desvío'}
        />
        <Kpi etiqueta="Riesgo vivo total" valor={eur(d.riesgoVivoTotal)} nota="saldo + cartera de pedidos pendientes" />
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Crédito y cobro por cliente</h2>
          <DescargarExcel
            nombre="credito-cobro-por-cliente"
            columnas={['Cliente', 'Saldo', 'Vencido', 'Riesgo vivo', 'Límite', '% límite', 'DSO', 'Δ DSO 30 días']}
            registros={d.porCliente.map((c) => [c.nombre, c.saldo, c.vencido, c.riesgoVivo, c.limite ?? '', c.consumoLimitePct === null ? '' : c.consumoLimitePct.toFixed(2), c.dso === null ? '' : c.dso.toFixed(2), c.dsoDelta === null ? '' : c.dsoDelta.toFixed(2)])}
          />
        </div>
        {d.porCliente.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin saldos pendientes.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="td-num">Saldo</th>
                  <th className="td-num">Vencido</th>
                  <th className="td-num">Riesgo vivo</th>
                  <th className="td-num">Límite</th>
                  <th className="td-num">% límite</th>
                  <th className="td-num">DSO</th>
                  <th className="td-num">DSO vs hace 30 días</th>
                </tr>
              </thead>
              <tbody>
                {d.porCliente.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td className="td-num">{eur(c.saldo)}</td>
                    <td className={`td-num ${c.vencido > 0 ? 'td-pos' : ''}`}>{eur(c.vencido)}</td>
                    <td className="td-num">{eur(c.riesgoVivo)}</td>
                    <td className="td-num">{c.limite ? eur(c.limite) : '—'}</td>
                    <td className={`td-num ${c.consumoLimitePct !== null && c.consumoLimitePct > 90 ? 'td-pos' : ''}`}>
                      {c.consumoLimitePct === null ? '—' : `${decimal(c.consumoLimitePct)} %`}
                    </td>
                    <td className="td-num">{c.dso === null ? '—' : `${decimal(c.dso)} días`}</td>
                    <td className="td-num">
                      {c.dso === null || c.dsoDelta === null ? '—' : `${c.dsoDelta > 0 ? '+' : ''}${decimal(c.dsoDelta)} días`}
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