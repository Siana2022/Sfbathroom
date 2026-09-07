import { cookies } from 'next/headers';
import { getStock, DIAS_SEGURIDAD, PLAZO_REPOSICION_DIAS } from '@/lib/datos/stock';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';

export const dynamic = 'force-dynamic';

export default async function StockPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getStock(empresa, filtros);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 4</p>
      <h1>Stock y cobertura</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Cobertura en días por artículo y almacén, stock disponible real, en tránsito, roturas y
        referencias bajo el punto de pedido de {d.empresa.nombre}.
      </p>

      <Filtros opciones={opciones} />

      <ul className="grid-kpis">
        <Kpi etiqueta="Valor de stock disponible" valor={eur(d.valorStock)} nota="a coste de artículo" />
        <Kpi etiqueta="Valor en tránsito" valor={eur(d.valorTrasito)} nota="ya en compra, aún no llegado" />
        <Kpi etiqueta="Cobertura media" valor={d.coberturaMedia > 0 ? `${decimal(d.coberturaMedia)} días` : '—'} nota="sobre consumo medio último 90 días" />
        <Kpi etiqueta="Roturas" valor={numero(d.roturas)} nota="referencias sin stock disponible" />
        <Kpi etiqueta="Bajo punto de pedido" valor={numero(d.bajoPuntoPedido)} nota="stock disponible inferior al punto" />
        <Kpi etiqueta="Referencias a aprovisionar" valor={numero(d.aprovisionamiento.length)} nota="propuesta de compra con dato de consumo" />
        <Kpi etiqueta="Rotación anual media" valor={d.rotacionMedia === null ? '—' : `${decimal(d.rotacionMedia)} veces`} nota="ventas 12 meses / stock disponible" />
        <Kpi etiqueta="Fill rate" valor={d.fillRate === null ? '—' : `${decimal(d.fillRate)} %`} nota="líneas servidas frente a pedidas" />
        <Kpi etiqueta="Venta perdida" valor={eur(d.ventaPerdida.reduce((a, v) => a + v.importe, 0))} nota="demanda no servida a precio de venta" />
        <Kpi etiqueta="Stock muerto / inmovilizado" valor={eur(d.stockMuerto.reduce((a, s) => a + s.valor, 0))} nota="sin ventas en 90 días o cobertura > 365" />
      </ul>

      <div className="card">
        <h2>Referencias bajo punto de pedido</h2>
        {d.bajoPunto.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Todas las referencias están por encima de su punto de pedido.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Almacén</th>
                <th className="td-num">Disponible</th>
                <th className="td-num">Punto de pedido</th>
                <th className="td-num">Cobertura</th>
                <th className="td-num">En tránsito</th>
              </tr>
            </thead>
            <tbody>
              {d.bajoPunto.map((r) => (
                <tr key={r.articulo + r.almacen}>
                  <td>{r.articulo}</td>
                  <td>{r.almacen}</td>
                  <td className="td-num">{numero(r.disponible)}</td>
                  <td className="td-num">{numero(r.punto)}</td>
                  <td className="td-num">{r.cobertura === null ? '—' : `${decimal(r.cobertura)} días`}</td>
                  <td className="td-num">{numero(r.transito)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Peor cobertura (días)</h2>
        {d.peorCobertura.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin datos de cobertura.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Almacén</th>
                <th className="td-num">Disponible</th>
                <th className="td-num">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {d.peorCobertura.map((r) => (
                <tr key={r.articulo + r.almacen}>
                  <td>{r.articulo}</td>
                  <td>{r.almacen}</td>
                  <td className="td-num">{numero(r.disponible)}</td>
                  <td className={`td-num ${r.cobertura !== null && r.cobertura < 20 ? 'td-pos' : ''}`}>{r.cobertura === null ? '—' : `${decimal(r.cobertura)} días`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Propuesta de aprovisionamiento</h2>
          <DescargarExcel
            nombre={`stock-aprovisionamiento`}
            columnas={['Artículo', 'Almacén', 'Consumo medio diario', 'Stock disponible', 'En tránsito', 'Propuesta de compra']}
            registros={d.aprovisionamiento.map((r) => [r.articulo, r.almacen, r.mediaDiaria, r.disponible, r.transito, r.propuesta])}
          />
        </div>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Cantidad sugerida para cubrir el plazo de reposición de {PLAZO_REPOSICION_DIAS} días
          más {DIAS_SEGURIDAD} días de seguridad, descontando stock disponible y en tránsito.
          Umbrales orientativos hasta que dirección los fije.
        </p>
        {d.aprovisionamiento.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Ninguna referencia con consumo requiere reposición.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Almacén</th>
                <th className="td-num">Consumo medio diario</th>
                <th className="td-num">Stock disponible</th>
                <th className="td-num">En tránsito</th>
                <th className="td-num">Propuesta de compra</th>
              </tr>
            </thead>
            <tbody>
              {d.aprovisionamiento.map((r) => (
                <tr key={r.articulo + r.almacen}>
                  <td>{r.articulo}</td>
                  <td>{r.almacen}</td>
                  <td className="td-num">{numero(r.mediaDiaria)}</td>
                  <td className="td-num">{numero(r.disponible)}</td>
                  <td className="td-num">{numero(r.transito)}</td>
                  <td className="td-num">{numero(r.propuesta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    <div className="card">
        <h2>Rotación por referencia</h2>
        {d.rotacionTop.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin referencias con ventas y stock suficiente para calcular rotación.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="td-num">Unidades vendidas (12M)</th>
                <th className="td-num">Stock disponible</th>
                <th className="td-num">Rotación anual</th>
              </tr>
            </thead>
            <tbody>
              {d.rotacionTop.map((r) => (
                <tr key={r.articulo}>
                  <td>{r.articulo}</td>
                  <td className="td-num">{numero(r.unidadesVendidas)}</td>
                  <td className="td-num">{numero(r.stockMedio)}</td>
                  <td className="td-num">{decimal(r.rotacion)} veces</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Venta perdida por rotura</h2>
        {d.ventaPerdida.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin demanda servida por debajo de lo pedido.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="td-num">Unidades no servidas</th>
                <th className="td-num">Importe perdido</th>
              </tr>
            </thead>
            <tbody>
              {d.ventaPerdida.map((v) => (
                <tr key={v.articulo}>
                  <td>{v.articulo}</td>
                  <td className="td-num">{numero(v.unidades)}</td>
                  <td className={`td-num ${v.importe > 0 ? 'td-pos' : ''}`}>{eur(v.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Stock muerto y baja rotación</h2>
        {d.stockMuerto.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin referencias sin consumo destacado.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Almacén</th>
                <th className="td-num">Unidades</th>
                <th className="td-num">Valor inmovilizado</th>
              </tr>
            </thead>
            <tbody>
              {d.stockMuerto.map((s) => (
                <tr key={s.articulo + s.almacen}>
                  <td>{s.articulo}</td>
                  <td>{s.almacen}</td>
                  <td className="td-num">{numero(s.disponible)}</td>
                  <td className={`td-num ${s.valor > 0 ? 'td-pos' : ''}`}>{eur(s.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Riesgo de cobertura frente a cartera de pedidos</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Cruce entre el stock disponible y lo que los pedidos abiertos demandan aún por servir.
          Marca riesgo cuando la cartera pendiente supera el stock disponible del artículo.
        </p>
        {d.cruceCoberturaCartera.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin cartera pendiente que cruzar.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="td-num">Stock disponible</th>
                <th className="td-num">Cobertura (días)</th>
                <th className="td-num">Cartera pendiente</th>
                <th className="td-num">Riesgo</th>
              </tr>
            </thead>
            <tbody>
              {d.cruceCoberturaCartera.map((c) => (
                <tr key={c.articulo}>
                  <td>{c.articulo}</td>
                  <td className="td-num">{numero(c.disponible)}</td>
                  <td className="td-num">{c.cubiertoDias === null ? '—' : `${decimal(c.cubiertoDias)} días`}</td>
                  <td className="td-num">{numero(c.carteraPendiente)}</td>
                  <td className={`td-num ${c.riesgo ? 'td-pos' : ''}`}>{c.riesgo ? 'No cubre cartera' : 'Cubre cartera'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}