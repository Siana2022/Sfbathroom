import { cookies } from 'next/headers';
import { getStock } from '@/lib/datos/stock';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getStock(empresa);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 4</p>
      <h1>Stock y cobertura</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Cobertura en días por artículo y almacén, stock disponible real, en tránsito, roturas y
        referencias bajo el punto de pedido de {d.empresa.nombre}.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Valor de stock disponible" valor={eur(d.valorStock)} nota="a coste de artículo" />
        <Kpi etiqueta="Valor en tránsito" valor={eur(d.valorTrasito)} nota="ya en compra, aún no llegado" />
        <Kpi etiqueta="Cobertura media" valor={d.coberturaMedia > 0 ? `${decimal(d.coberturaMedia)} días` : '—'} nota="sobre consumo medio último 90 días" />
        <Kpi etiqueta="Roturas" valor={numero(d.roturas)} nota="referencias sin stock disponible" />
        <Kpi etiqueta="Bajo punto de pedido" valor={numero(d.bajoPuntoPedido)} nota="stock disponible inferior al punto" />
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
    </div>
  );
}