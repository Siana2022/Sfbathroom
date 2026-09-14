import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { bloques } from '@/lib/bloques';
import { getFacturacion, getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getKpisPersonalizadosVistos } from '@/lib/datos/kpisVisibles';
import { decimal, eur, numero, pct } from '@/lib/formato';
import { FORMATOS } from '@/lib/datos/kpisCatalogo';
import Kpi from '@/components/Kpi';
import GraficoBarras, { type Barra } from '@/components/GraficoBarras';

export const dynamic = 'force-dynamic';

const ANIO = 2026;
const NOMBRE_MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

async function getResumenHoy(codigoEmpresa: string) {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const { data } = await supabase
    .from('resumenes')
    .select('texto, fecha, fuente')
    .eq('empresa_id', empresa.id)
    .order('fecha', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export default async function Home() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getFacturacion(empresa, ANIO);
  const MAX_KPI_PORTADA = 8;
  const kpisExtraTotal = await getKpisPersonalizadosVistos(empresa);
  const kpisExtra = kpisExtraTotal.slice(0, MAX_KPI_PORTADA);
  const resumen = await getResumenHoy(empresa);
  const delta = d.netaPrevioTotal > 0 ? pct(((d.neta - d.netaPrevioTotal) / d.netaPrevioTotal) * 100) : '—';

  const barras: Barra[] = d.series.map((s) => ({
    etiqueta: NOMBRE_MES[s.mes],
    valor: s.neta,
    valor2: s.presupuesto,
    titulo: `${NOMBRE_MES[s.mes]} ${d.anio}`,
  }));

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Resumen</p>
      <h1>Resumen · {d.empresa.nombre}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Ejercicio {d.anio}. Los indicadores leen de Supabase con la RLS del rol conectado y de la
        empresa seleccionada en la cabecera.
      </p>

      {resumen && (
        <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <h2 style={{ marginBottom: 4 }}>Tu resumen de hoy</h2>
          <p style={{ fontFamily: 'var(--serif, serif)', fontSize: 17, lineHeight: 1.55, margin: 0 }}>
            {resumen.texto}
          </p>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {resumen.fecha} · {resumen.fuente === 'ia' ? 'generado con IA' : 'plantilla determinista'}
          </span>
        </div>
      )}

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación neta ${d.anio}`} valor={eur(d.neta)} nota={`vs ${d.anioPrevio}: ${delta}`} />
        <Kpi etiqueta="Cumplimiento presupuesto" valor={d.cumplimiento === null ? '—' : `${decimal(d.cumplimiento)} %`} nota={d.cumplimiento === null ? 'sin presupuesto' : `sobre presupuesto ${eur(d.presupuesto)}`} />
        <Kpi etiqueta="Unidades facturadas" valor={numero(d.unidades)} nota={`${d.nFacturas} facturas`} />
        <Kpi etiqueta="Ticket medio" valor={eur(d.ticketMedio)} nota="por factura" />
        <Kpi etiqueta="Precio medio de venta" valor={eur(d.precioMedio)} nota="por unidad" />
        <Kpi etiqueta="Presupuesto anual" valor={eur(d.presupuesto)} nota={`ejercicio ${d.anio}`} />
      </ul>

      {kpisExtra.length > 0 && (
        <>
          <h2 style={{ marginBottom: 0 }}>
            KPIs personalizados
            {kpisExtraTotal.length > MAX_KPI_PORTADA && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 10 }}>
                mostrando {MAX_KPI_PORTADA} de {kpisExtraTotal.length} — gestionables en /kpis
              </span>
            )}
          </h2>
          <ul className="grid-kpis">
            {kpisExtra.map((k) => (
              <li key={k.id} className="kpi">
                <span className="kpi-etiqueta">{k.nombre}</span>
                <strong className="kpi-valor" style={{ color: k.estaBueno === null ? undefined : k.estaBueno ? 'var(--verde)' : 'var(--rojo)' }}>
                  {k.fmt}
                </strong>
                <span className="kpi-nota">
                  {k.objetivo != null
                    ? `${k.objetivo_op === 'gte' ? 'Objetivo ≥' : 'Objetivo ≤'} ${FORMATOS[k.formato]?.fmt(k.objetivo) ?? k.objetivo}`
                    : ' '}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="card">
        <h2>Evolución mensual de la facturación frente a presupuesto</h2>
        <GraficoBarras series={barras} formato={eur} leyenda={{ a: 'Facturación neta', b: 'Presupuesto' }} />
      </div>

      <div className="card">
        <h2>Top 5 clientes por facturación {d.anio}</h2>
        {d.topClientes.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin clientes con facturación en el ejercicio.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Facturación neta</th>
              </tr>
            </thead>
            <tbody>
              {d.topClientes.map((c, i) => (
                <tr key={c.id}>
                  <td>{i + 1}. {c.nombre}</td>
                  <td className="td-num">{eur(c.neta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Bloques del cuadro de mando</h2>
        <div className="chips">
          {bloques.map((b) => (
            <Link key={b.slug} href={b.slug} className="chip bloque chip-enlace">
              {b.numero}. {b.titulo}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}