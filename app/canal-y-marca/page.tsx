import { cookies } from 'next/headers';
import { getCanalMarca } from '@/lib/datos/canalMarca';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import Aviso from '@/components/Aviso';
import Tarta from '@/components/Tarta';
import GraficoBarras from '@/components/GraficoBarras';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

export default async function CanalMarcaPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getCanalMarca(empresa, ANIO, filtros);

  const sbImporte = d.porMarca.find((m) => m.marca === 'Starbath Plus')?.importe ?? 0;

  const cabeceraExcel = ['Segmento', 'Importe', '% facturación', 'Unidades', 'Precio medio', 'Clientes', 'Ref. activas', 'Cto. vs año anterior', 'Peso 12M rodante', 'Margen %', 'Margen €'];
  const filasExcel = d.porMarca.map((m) => [
      m.marca,
      m.importe.toFixed(2),
      m.pct.toFixed(2),
      m.unidades,
      m.precioMedio.toFixed(2),
      m.clientes,
      m.referencias,
      m.crecimientoPct === null ? '' : m.crecimientoPct.toFixed(2),
      m.peso12m === null ? '' : m.peso12m.toFixed(2),
      m.margenPct === null ? '' : m.margenPct.toFixed(2),
      m.margenAbs === null ? '' : m.margenAbs.toFixed(2),
    ]);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 7</p>
      <h1>Canal y marca</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Starbath Plus frente a marca blanca, y facturación por canal de {d.empresa.nombre} en {d.anio}.
      </p>

      <Filtros opciones={opciones} />

      <ul className="grid-kpis">
        <Kpi
          etiqueta="Facturación Starbath Plus"
          valor={eur(sbImporte)}
          nota={d.pctStarbath === null ? 'sin facturación' : `${decimal(d.pctStarbath)} % sobre el total`}
        />
        <Kpi
          etiqueta="Objetivo anual"
          valor={d.objetivoAnual > 0 ? eur(d.objetivoAnual) : '—'}
          nota={
            d.objetivoAnual > 0
              ? `${decimal((sbImporte / d.objetivoAnual) * 100)} % de avance`
              : 'Configúralo en /configuracion (ventas · objetivo_starbath)'
          }
        />
      </ul>

      <div className="card">
        <h2>Facturación Starbath Plus frente al objetivo</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
          Barras: facturación mensual Starbath Plus. Línea de referencia: objetivo anual repartido en 12 meses.
        </p>
        <GraficoBarras
          series={d.pctStarbathMensual.map((m) => ({
            etiqueta: m.mes,
            valor: m.sb,
            valor2: d.objetivoAnual > 0 ? d.objetivoAnual / 12 : null,
            titulo: `${m.mes}: ${eur(m.sb)}${d.objetivoAnual > 0 ? ` · objetivo ${eur(d.objetivoAnual / 12)}` : ''}`,
          }))}
          formato={eur}
          leyenda={{ a: 'Facturado Starbath Plus', b: 'Objetivo mensual' }}
        />
      </div>

      {(d.calidad.pctSinMarca > 0.5 || d.calidad.pctSinCanal > 0.5) && (
        <Aviso tipo="info">
          Calidad del dato: <strong>{decimal(d.calidad.pctSinMarca)} %</strong> de la facturación no tiene
          marca asignada ({eur(d.calidad.importeSinMarca)}) y <strong>{decimal(d.calidad.pctSinCanal)} %</strong>{' '}
          no tiene canal ({eur(d.calidad.importeSinCanal)}). El reparto por segmento puede no ser fiable
          hasta completar esos campos en A3ERP.
        </Aviso>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Métricas por segmento</h2>
          <DescargarExcel nombre={`canal-y-marca-${d.anio}`} columnas={cabeceraExcel} registros={filasExcel} etiqueta="Exportar a Excel" />
        </div>
        <table className="tabla">
          <thead>
            <tr>
              <th>Segmento</th>
              <th className="td-num">Importe</th>
              <th className="td-num">%</th>
              <th className="td-num">Unidades</th>
              <th className="td-num">Precio medio</th>
              <th className="td-num">Clientes</th>
              <th className="td-num">Ref. activas</th>
              <th className="td-num">Cto. vs año anterior</th>
              <th className="td-num">Peso 12M rodante</th>
              {!d.sinAccesoMargen && <th className="td-num">Margen</th>}
            </tr>
          </thead>
          <tbody>
            {d.porMarca.map((m) => (
              <tr key={m.marca}>
                <td>{m.marca}</td>
                <td className="td-num">{eur(m.importe)}</td>
                <td className="td-num">{decimal(m.pct)} %</td>
                <td className="td-num">{m.unidades}</td>
                <td className="td-num">{eur(m.precioMedio)}</td>
                <td className="td-num">{m.clientes}</td>
                <td className="td-num">{m.referencias}</td>
                <td className="td-num">{m.crecimientoPct === null ? '—' : `${decimal(m.crecimientoPct)} %`}</td>
                <td className="td-num">{m.peso12m === null ? '—' : `${decimal(m.peso12m)} %`}</td>
                {!d.sinAccesoMargen && <td className="td-num">{m.margenPct === null ? '—' : `${decimal(m.margenPct)} %`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <Tarta datos={d.porMarca.map((m) => ({ etiqueta: m.marca, valor: m.importe }))} />
      </div>

      <div className="card">
        <h2>Evolución del peso Starbath Plus — últimos 12 meses</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="td-num">Starbath Plus</th>
              <th className="td-num">Marca blanca</th>
              <th className="td-num">% SB</th>
            </tr>
          </thead>
          <tbody>
            {d.pctStarbathMensual.map((m) => {
              const tot = m.sb + m.mb;
              return (
                <tr key={m.mes}>
                  <td>{m.mes}</td>
                  <td className="td-num">{eur(m.sb)}</td>
                  <td className="td-num">{eur(m.mb)}</td>
                  <td className="td-num">{tot > 0 ? decimal((m.sb / tot) * 100) : '—'} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <GraficoBarras
          series={d.pctStarbathMensual.map((m) => ({
            etiqueta: m.mes,
            valor: m.sb,
            valor2: m.mb,
            titulo: `${m.mes}: Starbath ${eur(m.sb)} · Marca blanca ${eur(m.mb)}`,
          }))}
          formato={eur}
          leyenda={{ a: 'Starbath Plus', b: 'Marca blanca' }}
        />
      </div>

    </div>
  );
}