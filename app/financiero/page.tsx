import { cookies } from 'next/headers';
import { getCobros } from '@/lib/datos/cobros';
import { getTesoreria } from '@/lib/datos/tesoreria';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import { decimal, eur, numero, pct } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function FinancieroPage() {
  const cookieStore = cookies();
  const empresa = cookieStore.get('sfb_empresa')?.value ?? 'SF';
  const anio = new Date().getFullYear();
  const [cobros, tesoreria] = await Promise.all([getCobros(empresa, anio), getTesoreria(empresa)]);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque Financiero</p>
      <h1>Financiero</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Cuentas anuales, flujo de caja y balance. Sin API disponible — la carga prevista es
        desde Excel de la gestoría, cierre mensual, 3-5 ejercicios históricos. Los KPIs
        de estructura dependen de esa carga; hoy se estiman los de cobro (DSO) con datos reales.
      </p>

      <div className="card">
        <h2>Proyección de cobros (próximas 8 semanas)</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Pendientes por vencer agrupados por semana ISO según el plazo pactado del cliente.
          Las facturas ya vencidas se consideran cobro pendiente de hoy.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {tesoreria.pisos.map((s) => (
            <div key={s.inicio} className="kpi" style={{ flex: 1, minWidth: 120 }}>
              <span className="kpi-etiqueta">{s.etiqueta}</span>
              <strong className="kpi-valor">{eur(s.importe)}</strong>
              <span className="kpi-nota">{numero(s.facturas)} facturas</span>
            </div>
          ))}
        </div>
        <table className="tabla">
          <thead>
            <tr>
              <th>Factura</th>
              <th>Cliente</th>
              <th>Vencimiento</th>
              <th className="td-num">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {tesoreria.proximas.length === 0 ? (
              <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>Sin pendientes por vencer; todo el saldo está vencido o es cero.</td></tr>
            ) : (
              tesoreria.proximas.map((p) => (
                <tr key={`${p.factura}-${p.fechaVencimiento}`}>
                  <td>{p.factura ?? '—'}</td>
                  <td>{p.cliente}</td>
                  <td>{p.fechaVencimiento}</td>
                  <td className="td-num">{eur(p.importe)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>DSO — Días de venta pendiente de cobro</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Saldo abierto actual ÷ ventas netas de los últimos 365 días.
        </p>
        <ul className="grid-kpis">
          <Kpi etiqueta="DSO estimado" valor={cobros.dso !== null ? `${decimal(cobros.dso, 1)} días` : '—'} nota="objetivo ≤ 30 días" />
          <Kpi etiqueta="Saldo pendiente" valor={eur(cobros.saldoTotal)} nota={`${eur(cobros.vencido)} vencido`} />
          <Kpi etiqueta="Riesgo vivo" valor={eur(cobros.riesgoVivoTotal)} nota="saldo + cartera pedidos" />
          <Kpi etiqueta="En mora +90" valor={eur(cobros.buckets[4]?.importe ?? 0)} nota="atención prioritaria" />
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {cobros.buckets.map((b) => (
            <div key={b.label} className="kpi" style={{ flex: 1, minWidth: 120 }}>
              <span className="kpi-etiqueta">{b.label}</span>
              <strong className="kpi-valor">{eur(b.importe)}</strong>
              <span className="kpi-nota">{cobros.saldoTotal > 0 ? pct((b.importe / cobros.saldoTotal) * 100) : '0 %'} del saldo</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <DescargarExcel
            nombre="dso-financiero"
            columnas={['Tramo', 'Importe', '%']}
            registros={cobros.buckets.map((b) => [b.label, b.importe, cobros.saldoTotal > 0 ? (b.importe / cobros.saldoTotal) * 100 : 0])}
            etiqueta="Exportar DSO"
          />
        </div>
      </div>

      <div className="card">
        <h2>KPIs financieros propuestos (por validar con el cliente)</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          El cliente no calcula KPIs financieros hoy. Propuesta de primer set a validar. Todos
          dependen de la carga de cuentas anuales (balance + P&amp;G) desde Excel.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Definición</th>
                <th>Fuente</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Liquidez corriente</td><td>Activo corriente ÷ Pasivo corriente</td><td>Balance</td><td>ratio (≥ 1,5)</td></tr>
              <tr><td>Quick ratio</td><td>(Activo corriente − Stock) ÷ Pasivo corriente</td><td>Balance</td><td>ratio (≥ 1,0)</td></tr>
              <tr><td>Endeudamiento</td><td>Pasivo total ÷ Patrimonio neto</td><td>Balance</td><td>% (≤ 60 %)</td></tr>
              <tr><td>Solvencia</td><td>Patrimonio neto ÷ Pasivo total</td><td>Balance</td><td>ratio</td></tr>
              <tr><td>Fondo de maniobra</td><td>Activo corriente − Pasivo corriente</td><td>Balance</td><td>EUR</td></tr>
              <tr><td>EBITDA</td><td>Resultado + amortización + intereses + impuestos</td><td>P&amp;G</td><td>EUR</td></tr>
              <tr><td>Margen EBITDA</td><td>EBITDA ÷ Ventas netas</td><td>P&amp;G</td><td>%</td></tr>
              <tr><td>ROA</td><td>Resultado neto ÷ Activo total</td><td>Balance + P&amp;G</td><td>%</td></tr>
              <tr><td>ROE</td><td>Resultado neto ÷ Patrimonio neto</td><td>Balance + P&amp;G</td><td>%</td></tr>
              <tr><td>CCC</td><td>DSO + Días inventario − Días proveedor</td><td>Balance + P&amp;G</td><td>días</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Import de cuentas anuales</h2>
        <p style={{ color: 'var(--muted)' }}>
          Tablas destino: <code>financiero_cuentas_anuales</code> (ejercicio,
          tipo balance/pyg/flujo_caja, partida, importe) y <code>financiero_kpis</code>
          (ejercicio, periodo, kpi, valor, unidad). Ambas con empresa_id. Proceso previsto:
          import periódico desde el Excel de la gestoría.
        </p>
        <p style={{ color: 'var(--muted)', marginTop: 12 }}>
          Si tienes el Excel de la gestoría, compártelo y lo importamos.
        </p>
      </div>
    </div>
  );
}
