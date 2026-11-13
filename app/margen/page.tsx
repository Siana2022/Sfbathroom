import { Fragment } from 'react';
import { cookies } from 'next/headers';
import { getMargen } from '@/lib/datos/margen';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, eur2, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import Tarta from '@/components/Tarta';
import TablaFamilias from '@/components/TablaFamilias';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

const AYUDA: Record<string, string> = {
  importe: 'Importe vendido neto (base imponible de las líneas).',
  coste: 'Coste de la mercancía vendida: coste unitario de la línea o coste completo de llegada por lote.',
  margen: 'Importe vendido menos coste.',
  margenPct: 'Margen dividido entre el importe vendido.',
  margenUnidad: 'Margen medio por unidad vendida.',
  unidades: 'Unidades vendidas en el periodo.',
  facturas: 'Número de facturas en el tramo.',
  aTarifa: 'Lo que habría costado a precio de tarifa (unidades x precio_tarifa).',
  descuento: 'Diferencia entre el importe a tarifa y el importe vendido real.',
};

function umbralErosion(sp: SearchParams | undefined): number {
  const raw = sp?.erosion;
  const valor = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(valor)) return 15;
  return Math.min(100, Math.max(0, valor));
}

export default async function MargenPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const erosionMin = umbralErosion(searchParams);
  const opciones = await getOpcionesFiltros(empresa, { fuente: 'facturas', anio: ANIO });
  const d = await getMargen(empresa, ANIO, filtros, erosionMin);

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

  // Distribución de la erosión por cliente (para la tarta).
  const erosionPorCliente = new Map<string, number>();
  for (const f of d.erosionFacturas) {
    erosionPorCliente.set(f.cliente, (erosionPorCliente.get(f.cliente) ?? 0) + f.importe);
  }
  const erosionCliente = [...erosionPorCliente.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor }));

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2>Margen por familia</h2>
          <DescargarExcel
            nombre="margen-por-familia"
            columnas={['Familia', 'Importe', 'Coste', 'Margen', 'Margen %']}
            registros={d.porFamilia.map((f) => [f.familia, f.importe, f.coste, f.margen, f.margenPct])}
          />
        </div>
        <p className="nota" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Pincha en una familia para ver el top 10 de clientes que la compran.
        </p>
        <div className="split-columnas">
          <TablaFamilias familias={d.porFamilia} />
          <Tarta datos={d.porFamilia.map((f) => ({ etiqueta: f.familia, valor: f.importe }))} formato={eur} />
        </div>
      </div>

      <div className="card">
        <h2>Top 20 artículos por margen</h2>
        <div className="split-columnas">
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="td-num" title={AYUDA.importe}>Importe vendido</th>
                <th className="td-num" title={AYUDA.coste}>Coste</th>
                <th className="td-num" title={AYUDA.margen}>Margen</th>
                <th className="td-num" title={AYUDA.margenPct}>Margen %</th>
                <th className="td-num" title={AYUDA.margenUnidad}>Margen/ud</th>
              </tr>
            </thead>
            <tbody>
              {d.porArticulo.map((a) => (
                <tr key={a.articulo}>
                  <td title={a.articulo}>{a.articulo}</td>
                  <td className="td-num">{eur(a.importe)}</td>
                  <td className="td-num">{eur(a.coste)}</td>
                  <td className="td-num">{eur(a.margen)}</td>
                  <td className={`td-num ${a.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(a.margenPct)} %</td>
                  <td className="td-num">{eur2(a.margenUnidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Tarta datos={d.porArticulo.map((a) => ({ etiqueta: a.articulo, valor: a.margen }))} formato={eur} />
        </div>
      </div>

      <div className="card">
        <h2>Margen por comercial</h2>
        <div className="split-columnas">
          <table className="tabla">
            <thead>
              <tr>
                <th>Comercial</th>
                <th className="td-num" title={AYUDA.importe}>Importe vendido</th>
                <th className="td-num" title={AYUDA.coste}>Coste</th>
                <th className="td-num" title={AYUDA.margen}>Margen</th>
                <th className="td-num" title={AYUDA.margenPct}>Margen %</th>
              </tr>
            </thead>
            <tbody>
              {d.porComercial.map((c) => (
                <Fragment key={c.nombre}>
                  <tr>
                    <td>{c.secciones.length > 0 ? <strong>{c.nombre}</strong> : c.nombre}</td>
                    <td className="td-num">{eur(c.importe)}</td>
                    <td className="td-num">{eur(c.coste)}</td>
                    <td className="td-num">{eur(c.margen)}</td>
                    <td className={`td-num ${c.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(c.margenPct)} %</td>
                  </tr>
                  {c.secciones.map((s) => (
                    <tr key={`${c.nombre}-${s.nombre}`} style={{ color: 'var(--muted)' }}>
                      <td style={{ paddingLeft: 24 }}>· {s.nombre}</td>
                      <td className="td-num">{eur(s.importe)}</td>
                      <td className="td-num">{eur(s.coste)}</td>
                      <td className="td-num">{eur(s.margen)}</td>
                      <td className="td-num">{decimal(s.margenPct)} %</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Tarta datos={d.porComercial.map((c) => ({ etiqueta: c.nombre, valor: c.importe }))} formato={eur} />
        </div>
      </div>

      <div className="card">
        <h2>Margen por cliente</h2>
        <p className="nota" style={{ color: 'var(--muted)', marginTop: 0 }}>Top 20 por importe vendido.</p>
        <div className="split-columnas">
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num" title={AYUDA.importe}>Importe vendido</th>
                <th className="td-num" title={AYUDA.coste}>Coste</th>
                <th className="td-num" title={AYUDA.margen}>Margen</th>
                <th className="td-num" title={AYUDA.margenPct}>Margen %</th>
              </tr>
            </thead>
            <tbody>
              {d.porCliente.map((c) => (
                <tr key={c.nombre}>
                  <td title={c.nombre}>{c.nombre}</td>
                  <td className="td-num">{eur(c.importe)}</td>
                  <td className="td-num">{eur(c.coste)}</td>
                  <td className="td-num">{eur(c.margen)}</td>
                  <td className={`td-num ${c.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(c.margenPct)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Tarta datos={d.porCliente.map((c) => ({ etiqueta: c.nombre, valor: c.importe }))} formato={eur} />
        </div>
      </div>

      <div className="card">
        <h2>Margen por país</h2>
        <div className="split-columnas">
          <table className="tabla">
            <thead>
              <tr>
                <th>País</th>
                <th className="td-num" title={AYUDA.importe}>Importe vendido</th>
                <th className="td-num" title={AYUDA.coste}>Coste</th>
                <th className="td-num" title={AYUDA.margen}>Margen</th>
                <th className="td-num" title={AYUDA.margenPct}>Margen %</th>
              </tr>
            </thead>
            <tbody>
              {d.porPais.map((p) => (
                <tr key={p.nombre}>
                  <td title={p.nombre}>{p.nombre}</td>
                  <td className="td-num">{eur(p.importe)}</td>
                  <td className="td-num">{eur(p.coste)}</td>
                  <td className="td-num">{eur(p.margen)}</td>
                  <td className={`td-num ${p.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(p.margenPct)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Tarta datos={d.porPais.map((p) => ({ etiqueta: p.nombre, valor: p.importe }))} formato={eur} />
        </div>
      </div>

      <div className="card">
        <h2>Distribución de márgenes por factura</h2>
        <div className="split-columnas">
          <table className="tabla">
            <thead>
              <tr>
                <th>Tramo de margen</th>
                <th className="td-num" title={AYUDA.facturas}>Facturas</th>
                <th className="td-num">Importe</th>
                <th className="td-num" title={AYUDA.margen}>Margen</th>
              </tr>
            </thead>
            <tbody>
              {d.facturasPorTramo.map((t) => (
                <tr key={t.tramo}>
                  <td>{t.tramo}</td>
                  <td className="td-num">{numero(t.facturas)}</td>
                  <td className="td-num">{eur(t.importe)}</td>
                  <td className="td-num">{eur(t.margen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Tarta datos={d.facturasPorTramo.map((t) => ({ etiqueta: t.tramo, valor: t.importe }))} formato={eur} />
        </div>
      </div>

      <div className="card">
        <h2>Erosión de tarifa</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
          Facturas cuyo precio real queda por debajo de tarifa más del umbral indicado. Erosión media
          ponderada por importe en el año: <strong>{decimal(d.erosionMedia ?? 0)} %</strong>.
        </p>
        <form method="get" className="form-erosion">
          {Object.entries(searchParams ?? {})
            .filter(([clave]) => clave !== 'erosion')
            .map(([clave, valor]) =>
              (Array.isArray(valor) ? valor : [valor])
                .filter((v): v is string => typeof v === 'string' && v !== '')
                .map((v, i) => <input key={`${clave}-${i}`} type="hidden" name={clave} value={v} />),
            )}
          <label>
            Descuento mínimo (%)
            <input type="number" name="erosion" min={0} max={100} step={1} defaultValue={d.erosionUmbral} />
          </label>
          <button className="boton" type="submit">
            Aplicar
          </button>
        </form>
        <div className="split-columnas">
          {d.erosionFacturas.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Ninguna factura supera el umbral del {decimal(d.erosionUmbral, 0)} %.
            </p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Cliente</th>
                  <th className="td-num" title={AYUDA.importe}>Importe vendido</th>
                  <th className="td-num" title={AYUDA.aTarifa}>A tarifa</th>
                  <th className="td-num" title={AYUDA.descuento}>Descuento</th>
                  <th className="td-num" title={AYUDA.margenPct}>Margen %</th>
                </tr>
              </thead>
              <tbody>
                {d.erosionFacturas.map((f) => (
                  <tr key={`${f.factura}-${f.cliente}`}>
                    <td>{f.factura}</td>
                    <td>{f.cliente}</td>
                    <td className="td-num">{eur(f.importe)}</td>
                    <td className="td-num">{eur(f.importeTarifa)}</td>
                    <td className="td-num" style={{ color: 'var(--rojo)', fontWeight: 600 }}>
                      {decimal(f.descuentoPct)} %
                    </td>
                    <td className={`td-num ${f.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(f.margenPct)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Tarta datos={erosionCliente} formato={eur} />
        </div>
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
              <th className="td-num" title={AYUDA.unidades}>Unidades</th>
              <th className="td-num">Bruto</th>
              <th className="td-num" title={AYUDA.descuento}>Descuento</th>
              <th className="td-num">Neto</th>
              <th className="td-num" title={AYUDA.coste}>Coste</th>
              <th className="td-num" title={AYUDA.margen}>Margen</th>
              <th className="td-num" title={AYUDA.margenPct}>Margen %</th>
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
