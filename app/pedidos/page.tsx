import { cookies } from 'next/headers';
import { getUsuario } from '@/lib/datos/role';
import { getPedidosPanel, getPedidosPanelFusionado, type PedidoOperativo } from '@/lib/datos/pedidosPanel';
import { eur, fecha, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import ObservacionPedido from '@/components/ObservacionPedido';
import { ANIO_ACTUAL } from '@/lib/ejercicio';

const ANIO = ANIO_ACTUAL;

/** Resumen de lo pedido: hasta 4 líneas y el resto como «+N». */
function Lineas({ lineas }: { lineas: PedidoOperativo['lineas'] }) {
  if (lineas.length === 0) return <span style={{ color: 'var(--muted)' }}>Sin detalle de líneas</span>;
  const visibles = lineas.slice(0, 4);
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
      {visibles.map((l, i) => (
        <div key={i}>
          {numero(l.cantidad)} × {l.descripcion || l.codigo || '—'}
        </div>
      ))}
      {lineas.length > visibles.length ? (
        <div style={{ color: 'var(--muted)' }}>+{lineas.length - visibles.length} líneas más</div>
      ) : null}
    </div>
  );
}

function Vacio({ children }: { children: string }) {
  return <p style={{ color: 'var(--muted)' }}>{children}</p>;
}

export default async function PedidosPage() {
  const usuario = await getUsuario();
  const esComercial = usuario?.rol === 'comercial';
  const d = esComercial
    ? await getPedidosPanelFusionado(ANIO)
    : await getPedidosPanel(cookies().get('sfb_empresa')?.value ?? 'SF', ANIO);

  const conEmpresa = esComercial && d.pendientes.some((p) => p.empresa);

  const tablas = [
    {
      titulo: 'Pendientes de servir (sin fecha programada)',
      filas: d.pendientes,
      columnas: ['Cliente', 'Pedido', 'Fecha del pedido', 'Qué han pedido'],
      render: (p: PedidoOperativo) => (
        <>
          <td>{p.cliente}</td>
          <td>{p.numero}</td>
          <td>{fecha(p.fecha)}</td>
          <td><Lineas lineas={p.lineas} /></td>
        </>
      ),
    },
    {
      titulo: 'Con fecha de entrega programada',
      filas: d.programados,
      columnas: ['Cliente', 'Pedido', 'Fecha del pedido', 'Entrega prevista', 'Qué han pedido'],
      render: (p: PedidoOperativo) => (
        <>
          <td>{p.cliente}</td>
          <td>{p.numero}</td>
          <td>{fecha(p.fecha)}</td>
          <td>{fecha(p.fechaPrometida)}</td>
          <td><Lineas lineas={p.lineas} /></td>
        </>
      ),
    },
  ];

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 2</p>
      <h1>Pedidos pendientes</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Todo lo que está pendiente de servir de {d.empresa.nombre}: lo que aún no tiene fecha, lo que
        está programado y lo que ya va fuera de plazo.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Cartera pendiente" valor={eur(d.importePendiente)} nota={`${numero(d.pendientes.length)} pedidos`} />
        <Kpi etiqueta="Con fecha programada" valor={eur(d.importeProgramado)} nota={`${numero(d.programados.length)} pedidos`} />
        <Kpi
          etiqueta="Fuera de plazo"
          valor={numero(d.fueraPlazo.length)}
          nota={`${eur(d.importeFueraPlazo)} en riesgo`}
        />
      </ul>

      {tablas.map((t) => (
        <div className="card" key={t.titulo}>
          <h2>{t.titulo} ({t.filas.length})</h2>
          {t.filas.length === 0 ? (
            <Vacio>No hay pedidos en esta situación.</Vacio>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  {conEmpresa ? <th>Empresa</th> : null}
                  {t.columnas.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.filas.map((p) => (
                  <tr key={p.id}>
                    {conEmpresa ? <td><span className="badge">{p.empresa}</span></td> : null}
                    {t.render(p)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <div className="card">
        <h2>Fuera de plazo de entrega ({d.fueraPlazo.length})</h2>
        {d.fueraPlazo.length === 0 ? (
          <Vacio>Ningún pedido pendiente ha pasado su fecha de entrega.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                {conEmpresa ? <th>Empresa</th> : null}
                <th>Cliente</th>
                <th>Pedido</th>
                <th>Fecha del pedido</th>
                <th>Entrega prevista</th>
                <th className="td-num">Días</th>
                <th>Qué han pedido</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {d.fueraPlazo.map((p) => (
                <tr key={p.id}>
                  {conEmpresa ? <td><span className="badge">{p.empresa}</span></td> : null}
                  <td>{p.cliente}</td>
                  <td>{p.numero}</td>
                  <td>{fecha(p.fecha)}</td>
                  <td>{fecha(p.fechaPrometida)}</td>
                  <td className="td-num" style={{ color: 'var(--rojo)', fontWeight: 600 }}>{p.diasRetraso}</td>
                  <td><Lineas lineas={p.lineas} /></td>
                  <td>
                    <ObservacionPedido pedidoId={p.id} empresaId={p.empresaId} observacion={p.observacion} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
