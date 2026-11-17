import { cookies } from 'next/headers';
import { getCobros } from '@/lib/datos/cobros';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import Aviso from '@/components/Aviso';
import TablaCreditosClientes from '@/components/TablaCreditosClientes';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

export default async function CreditoCobroPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getCobros(empresa, ANIO, filtros);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 9</p>
      <h1>Crédito y cobro</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Saldo de clientes, DSO, aging de la deuda y vencidos de {d.empresa.nombre}.
      </p>

      <Filtros opciones={opciones} />

      {!d.fuenteCartera && (
        <Aviso tipo="info">
          Aún no hay <strong>cobros</strong> cargados (A3ERP no los exporta todavía). El saldo se
          estima como el importe de las facturas de A3ERP sin descontar pagos, por lo que el
          vencido y el DSO salen más altos que la realidad.
        </Aviso>
      )}

      <ul className="grid-kpis">
        <Kpi etiqueta="Saldo total de clientes" valor={eur(d.saldoTotal)} nota={`de los que ${eur(d.vencido)} vencido`} />
        <Kpi etiqueta="Mora en pago" valor={eur(d.vencido)} nota={`${eur(d.enCarteraFuturo)} en cartera, aún no vencido`} />
        <Kpi etiqueta="Media de cobros" valor={d.dso === null ? '—' : `${decimal(d.dso)} días`} nota="días de venta a cobrar" />
        <Kpi
          etiqueta="Desvío vs 30 días pactados"
          valor={d.dsoDesvioDias > 0 ? `${decimal(d.dsoDesvioDias)} días` : 'al día'}
          nota={d.dsoDesvioDias > 0 ? `${eur(d.dsoDesvioEuros)} de circulante atrapado` : 'sin capital inmovilizado por desvío'}
        />
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

      <TablaCreditosClientes filas={d.porCliente} />
    </div>
  );
}