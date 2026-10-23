import { cookies } from 'next/headers';
import { getMargen } from '@/lib/datos/margen';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, eur2, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

export default async function MargenPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa, { fuente: 'facturas', anio: ANIO });
  const d = await getMargen(empresa, ANIO, filtros);

  if (d.sinAcceso) {
    return (
      <div>
        <p className="breadcrumb">Cuadro mando comercial · Bloque 3</p>
        <h1>Margen y rentabilidad</h1>
        <div className="card">
          <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
            El bloque de margen y costes está restringido a dirección y al responsable financiero.
            Consulta al administrador si necesitas acceso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 3</p>
      <h1>Margen y rentabilidad</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Margen de {d.empresa.nombre} en {d.anio}, calculado sobre el coste unitario de cada línea y
        el coste completo de llegada por lote (flete, aduana, seguro, transporte y tipo de cambio).
      </p>

      <Filtros opciones={opciones} />

      <ul className="grid-kpis">
        <Kpi etiqueta="Margen bruto" valor={eur(d.margen)} nota={`${decimal(d.margenPct)} % sobre venta`} />
        <Kpi etiqueta="Importe vendido" valor={eur(d.importeVendido)} nota={`coste de venta ${eur(d.costeVenta)}`} />
        <Kpi etiqueta="Margen medio" valor={`${decimal(d.margenPct)} %`} nota="venta − coste de venta" />
      </ul>

      <div className="card">
        <h2>Margen por familia</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Familia</th>
              <th className="td-num">Importe vendido</th>
              <th className="td-num">Coste</th>
              <th className="td-num">Margen</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {d.porFamilia.map((f) => (
              <tr key={f.familia}>
                <td>{f.familia}</td>
                <td className="td-num">{eur(f.importe)}</td>
                <td className="td-num">{eur(f.coste)}</td>
                <td className="td-num">{eur(f.margen)}</td>
                <td className={`td-num ${f.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(f.margenPct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <DescargarExcel
            nombre="margen-por-familia"
            columnas={['Familia', 'Importe', 'Coste', 'Margen', 'Margen %']}
            registros={d.porFamilia.map((f) => [f.familia, f.importe, f.coste, f.margen, f.margenPct])}
          />
        </div>
      </div>

      <div className="card">
        <h2>Top 10 artículos por margen</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="td-num">Unidades</th>
              <th className="td-num">Importe</th>
              <th className="td-num">Margen</th>
              <th className="td-num">Margen / unidad</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {d.porArticulo.map((a) => (
              <tr key={a.articulo}>
                <td>{a.articulo}</td>
                <td className="td-num">{Math.round(a.unidades)}</td>
                <td className="td-num">{eur(a.importe)}</td>
                <td className="td-num">{eur(a.margen)}</td>
                <td className="td-num">{eur2(a.margenUnidad)}</td>
                <td className={`td-num ${a.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(a.margenPct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Margen por comercial</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Comercial</th>
              <th className="td-num">Importe</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {d.porComercial.map((c) => (
              <tr key={c.nombre}>
                <td>{c.nombre}</td>
                <td className="td-num">{eur(c.importe)}</td>
                <td className={`td-num ${c.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(c.margenPct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Margen por cliente y país</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="td-num">Importe</th>
              <th className="td-num">Margen %</th>
              <th>País</th>
              <th className="td-num">Importe</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {d.porCliente.map((c, i) => (
              <tr key={c.nombre}>
                <td>{c.nombre}</td>
                <td className="td-num">{eur(c.importe)}</td>
                <td className={`td-num ${c.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(c.margenPct)} %</td>
                <td>{d.porPais[i]?.nombre ?? ''}</td>
                <td className="td-num">{d.porPais[i] ? eur(d.porPais[i].importe) : ''}</td>
                <td className="td-num">{d.porPais[i] ? `${decimal(d.porPais[i].margenPct)} %` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Distribución de márgenes por factura</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Tramo de margen</th>
              <th className="td-num">Facturas</th>
              <th className="td-num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {d.facturasPorTramo.map((t) => (
              <tr key={t.tramo}>
                <td>{t.tramo}</td>
                <td className="td-num">{t.facturas}</td>
                <td className="td-num">{eur(t.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Matriz margen × rotación</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Número de artículos por tramo de margen y tercil de unidades vendidas (rotación).
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Margen</th>
              <th className="td-num">Rotación baja</th>
              <th className="td-num">Rotación media</th>
              <th className="td-num">Rotación alta</th>
            </tr>
          </thead>
          <tbody>
            {d.matrizMargenRotacion.map((m) => (
              <tr key={m.tramoMargen}>
                <td>{m.tramoMargen}</td>
                <td className="td-num">{m.baja}</td>
                <td className="td-num">{m.media}</td>
                <td className="td-num">{m.alta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Erosión de tarifa</h2>
        {d.erosionTarifa.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            Sin descuentos sobre tarifa detectados ({d.erosionMedia === null ? '—' : `erosión media ponderada ${decimal(d.erosionMedia)} %`}).
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Precio medio de venta frente a tarifa; erosión media ponderada por importe:{' '}
              <strong>{decimal(d.erosionMedia ?? 0)} %</strong>.
            </p>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th className="td-num">Unidades</th>
                  <th className="td-num">PVD</th>
                  <th className="td-num">Tarifa</th>
                  <th className="td-num">Erosión</th>
                </tr>
              </thead>
              <tbody>
                {d.erosionTarifa.map((e) => (
                  <tr key={e.articulo}>
                    <td>{e.articulo}</td>
                    <td className="td-num">{Math.round(e.unidades)}</td>
                    <td className="td-num">{eur2(e.pvd)}</td>
                    <td className="td-num">{eur2(e.tarifa)}</td>
                    <td className={`td-num ${e.erosionPct > 0 ? 'td-pos' : ''}`}>{decimal(e.erosionPct)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h2>Cuadro analítico mensual</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Reproduce el analítico de {d.anio}: Bruto = Σ unidades × precio; Descuento = Bruto − Neto;
          Neto = base imponible de línea; Margen = Neto − Coste.
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="td-num">Unidades</th>
              <th className="td-num">Bruto</th>
              <th className="td-num">Descuento</th>
              <th className="td-num">Neto</th>
              <th className="td-num">Coste</th>
              <th className="td-num">Margen</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {d.mensual.map((m) => (
              <tr key={m.mes}>
                <td>{m.mes}</td>
                <td className="td-num">{numero(m.unidades)}</td>
                <td className="td-num">{eur(m.bruto)}</td>
                <td className="td-num">{eur(m.descuento)}</td>
                <td className="td-num">{eur(m.neto)}</td>
                <td className="td-num">{eur(m.coste)}</td>
                <td className="td-num">{eur(m.margen)}</td>
                <td className={`td-num ${m.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(m.margenPct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <DescargarExcel
            nombre="cuadro-analitico-mensual"
            columnas={['Mes', 'Unidades', 'Bruto', 'Descuento', 'Neto', 'Coste', 'Margen', 'Margen %']}
            registros={d.mensual.map((m) => [m.mes, m.unidades, m.bruto, m.descuento, m.neto, m.coste, m.margen, m.margenPct])}
          />
        </div>
      </div>

    </div>
  );
}