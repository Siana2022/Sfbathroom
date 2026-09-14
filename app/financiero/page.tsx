import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import { decimal, eur, numero, pct } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

type FilaFactura = { id: string; fecha: string; total: number };
type FilaCobro = { factura_id: string | null; importe: number; impagado: boolean };

type SerieEdad = { antiguedad: string; importe: number; porc: number };

async function getDso(supabase: ReturnType<typeof createClient>, empresaId: string, anio: number) {
  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, fecha, total')
    .eq('empresa_id', empresaId)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`);
  const { data: cobros } = await supabase
    .from('cobros')
    .select('factura_id, importe, impagado')
    .eq('empresa_id', empresaId);

  const porFactura = new Map<string, number>();
  for (const c of (cobros ?? []) as FilaCobro[]) {
    if (c.impagado || !c.factura_id) continue;
    porFactura.set(c.factura_id, (porFactura.get(c.factura_id) ?? 0) + Number(c.importe ?? 0));
  }

  const hoy = new Date(`${anio}-12-31T00:00:00`);
  const serie: SerieEdad[] = [
    { antiguedad: 'Corriente', importe: 0, porc: 0 },
    { antiguedad: '1-30 días', importe: 0, porc: 0 },
    { antiguedad: '31-60 días', importe: 0, porc: 0 },
    { antiguedad: '61-90 días', importe: 0, porc: 0 },
    { antiguedad: '+90 días', importe: 0, porc: 0 },
  ];

  let neta = 0;
  let saldoPendiente = 0;
  let saldoVencido = 0;
  for (const f of (facturas ?? []) as FilaFactura[]) {
    const total = Number(f.total ?? 0);
    neta += total;
    const cobrado = porFactura.get(f.id) ?? 0;
    if (cobrado >= total) continue;
    const pendiente = total - cobrado;
    saldoPendiente += pendiente;
    const dias = Math.max(0, Math.floor((hoy.getTime() - new Date(`${f.fecha}T00:00:00`).getTime()) / 86400000));
    if (dias > 0) saldoVencido += pendiente;
    if (dias <= 0) serie[0].importe += pendiente;
    else if (dias <= 30) serie[1].importe += pendiente;
    else if (dias <= 60) serie[2].importe += pendiente;
    else if (dias <= 90) serie[3].importe += pendiente;
    else serie[4].importe += pendiente;
  }

  const ventaDiaria = neta / 365;
  const dso = ventaDiaria > 0 ? saldoPendiente / ventaDiaria : 0;
  const totalSerie = serie.reduce((a, b) => a + b.importe, 0);
  for (const s of serie) s.porc = totalSerie > 0 ? Math.round((s.importe / totalSerie) * 1000) / 10 : 0;

  return { dso, ventaDiaria, saldoPendiente, saldoVencido, serie };
}

export default async function FinancieroPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi',
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const empresa = await getEmpresaPorCodigo(cookieStore.get('sfb_empresa')?.value ?? 'SF');
  const dso = await getDso(supabase, empresa.id, ANIO);

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
        <h2>DSO — Días de venta pendiente de cobro · {ANIO}</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Calculado sobre facturas del ejercicio menos los cobros registrados. Criterio:
          saldo pendiente ÷ venta diaria (neta anual ÷ 365).
        </p>
        <ul className="grid-kpis">
          <Kpi etiqueta="DSO estimado" valor={`${decimal(dso.dso, 1)} días`} nota="objetivo ≤ 30 días" />
          <Kpi etiqueta="Saldo pendiente" valor={eur(dso.saldoPendiente)} nota={`${eur(dso.saldoVencido)} vencido`} />
          <Kpi etiqueta="Venta diaria" valor={eur(dso.ventaDiaria)} nota="neta anual ÷ 365" />
          <Kpi etiqueta="Cartera total" valor={numero(dso.serie.reduce((a, b) => a + b.importe, 0))} nota="suma por antigüedad" />
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {dso.serie.map((s) => (
            <div key={s.antiguedad} className="kpi" style={{ flex: 1, minWidth: 120 }}>
              <span className="kpi-etiqueta">{s.antiguedad}</span>
              <strong className="kpi-valor">{eur(s.importe)}</strong>
              <span className="kpi-nota">{pct(s.porc)} del saldo</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <DescargarExcel
            nombre="dso-financiero"
            columnas={['Antigüedad', 'Importe', '%']}
            registros={dso.serie.map((s) => [s.antiguedad, s.importe, s.porc])}
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