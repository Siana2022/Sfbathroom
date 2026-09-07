import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDocumento } from '@/lib/datos/documentos';
import { decimal, eur, eur2, numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<string, string> = {
  captado: 'Captado',
  aceptado: 'Aceptado',
  parcial: 'Servido parcialmente',
  servido: 'Servido',
  anulado: 'Anulado',
};

export default async function DocumentoPage({ params }: { params: { id: string } }) {
  const d = await getDocumento(params.id);
  if (!d) notFound();

  const fecha = (f: string) =>
    new Date(`${f}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Documentos origen · {d.tipo}</p>
      <Link className="doc-volver" href="/documentos">
        ← Volver a documentos
      </Link>
      <h1>{d.tipo} {d.numero}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        {d.cliente} · {d.comercial} · {fecha(d.fecha)} · {d.empresa.nombre}
      </p>

      <div className="card">
        <h2>Cabecera</h2>
        <div className="grid-resumen-doc">
          <div>
            <span className="kpi-etiqueta">Cliente</span>
            <strong>{d.cliente}</strong>
          </div>
          <div>
            <span className="kpi-etiqueta">Comercial</span>
            <strong>{d.comercial}</strong>
          </div>
          <div>
            <span className="kpi-etiqueta">Fecha</span>
            <strong>{fecha(d.fecha)}</strong>
          </div>
          <div>
            <span className="kpi-etiqueta">Albarán</span>
            <strong>{d.albaran ?? '—'}</strong>
          </div>
          <div>
            <span className="kpi-etiqueta">Pedido de origen</span>
            <strong>{d.pedido ? `${d.pedido.numero} · ${ESTADO_LABEL[d.pedido.estado] ?? d.pedido.estado} · ${fecha(d.pedido.fecha)}` : '—'}</strong>
          </div>
          {d.anula && (
            <div>
              <span className="kpi-etiqueta">Anula al documento</span>
              <strong className="td-pos">{d.anula.numero}</strong>
            </div>
          )}
          {d.anuladaPor && (
            <div>
              <span className="kpi-etiqueta">Anulado por</span>
              <strong>{d.anuladaPor.numero}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Líneas ({d.lineas.length})</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Artículo</th>
                <th>Familia</th>
                <th>Marca</th>
                <th className="td-num">Cantidad</th>
                <th className="td-num">Precio</th>
                <th className="td-num">Dto %</th>
                <th className="td-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.lineas.map((l) => (
                <tr key={l.codigo + l.articulo + l.cantidad}>
                  <td>{l.codigo}</td>
                  <td>{l.articulo}</td>
                  <td>{l.familia}</td>
                  <td>{l.marca}</td>
                  <td className="td-num">{decimal(l.cantidad)}</td>
                  <td className="td-num">{eur2(l.precio)}</td>
                  <td className="td-num">{decimal(l.descuento)}</td>
                  <td className="td-num">{eur2(l.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="grid-kpis" style={{ marginTop: 16 }}>
          <li className="kpi">
            <span className="kpi-etiqueta">Base imponible</span>
            <strong className="kpi-valor">{eur2(d.base)}</strong>
            <span className="kpi-nota">descuento pie {eur2(d.descuentoPie)}</span>
          </li>
          <li className="kpi">
            <span className="kpi-etiqueta">Portes</span>
            <strong className="kpi-valor">{eur2(d.portes)}</strong>
            <span className="kpi-nota">rappel {eur2(d.rappel)}</span>
          </li>
          <li className="kpi">
            <span className="kpi-etiqueta">Total</span>
            <strong className="kpi-valor">{eur(d.total)}</strong>
            <span className="kpi-nota">{numero(d.lineas.length)} líneas</span>
          </li>
        </ul>
      </div>
    </div>
  );
}