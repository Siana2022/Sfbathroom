import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getFichaCliente } from '@/lib/datos/fichaCliente';
import { decimal, eur, numero, pct } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import GraficoBarras from '@/components/GraficoBarras';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function FichaClientePage({ params }: { params: { id: string } }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getFichaCliente(empresa, params.id, ANIO);
  if (!d) notFound();

  const barras = d.historico.map((m) => ({ etiqueta: m.mes, valor: Math.max(0, m.neta), titulo: `${m.mes}: ${eur(m.neta)}` }));

  return (
    <div>
      <p className="breadcrumb">
        <Link href="/clientes">Clientes</Link> · Ficha 360º
      </p>
      <h1>{d.cliente.nombre}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        {d.cliente.codigoErp && <>Ref. {d.cliente.codigoErp} · </>}
        {d.cliente.cif && <>CIF {d.cliente.cif} · </>}
        {d.cliente.provincia || d.cliente.pais}
        {d.cliente.comercial && <> · Comercial: {d.cliente.comercial}</>}
        {d.cliente.grupo && <> · Grupo: {d.cliente.grupo}</>}
        {' · '}<span className={d.cliente.estado === 'activo' ? 'badge listo' : 'badge construccion'}>{d.cliente.estado}</span>
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación neta ${d.anio}`} valor={eur(d.neta)} nota={d.deltaPct === null ? 'sin dato previo' : `vs ${d.anio - 1}: ${pct(d.deltaPct)}`} />
        <Kpi etiqueta="Facturas" valor={numero(d.facturas)} nota={`${numero(d.unidades)} unidades`} />
        <Kpi etiqueta="Ticket medio" valor={eur(d.ticketMedio)} nota="por factura" />
        <Kpi etiqueta="Saldo pendiente" valor={eur(d.saldo)} nota={`${eur(d.vencido)} vencido`} />
        <Kpi etiqueta="DSO del cliente" valor={d.dsoDias === null ? '—' : `${decimal(d.dsoDias)} días`} nota="últimos 12 meses" />
      </ul>

      <div className="card">
        <h2>Evolución de compras (15 meses)</h2>
        <GraficoBarras series={barras} formato={eur} leyenda={{ a: 'Compras netas' }} />
      </div>

      <div className="card">
        <h2>Top artículos comprados {d.anio}</h2>
        {d.topArticulos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin compras de artículos en el ejercicio.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="td-num">Unidades</th>
                <th className="td-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.topArticulos.map((a, i) => (
                <tr key={i}>
                  <td>{a.nombre}</td>
                  <td className="td-num">{numero(a.unidades)}</td>
                  <td className="td-num">{eur(a.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Últimas facturas</h2>
        {d.ultimasFacturas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin facturas registradas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Número</th>
                <th className="td-num">Importe</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {d.ultimasFacturas.map((f) => (
                <tr key={f.id}>
                  <td>{f.fecha}</td>
                  <td>{f.numero ?? '—'}</td>
                  <td className="td-num">{eur(f.importe)}</td>
                  <td>{f.tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}