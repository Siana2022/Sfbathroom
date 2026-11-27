import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getFichaCliente, getCodigoEmpresaDeCliente } from '@/lib/datos/fichaCliente';
import { getCrossSell } from '@/lib/datos/crosssell';
import { decimal, eur, numero, pct } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import EditorContactosCliente from '@/components/EditorContactosCliente';
import { getContactosCliente } from '@/lib/datos/contactos';
import { getPedidosCliente, getPreciosCliente, getReunionesCliente } from '@/lib/datos/ficha360';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getSeguimientoCliente } from '@/lib/datos/seguimiento';
import PanelSeguimiento from '@/components/PanelSeguimiento';
import BotonExportar from '@/components/BotonExportar';
import GraficoBarras from '@/components/GraficoBarras';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

type Anotacion = { fecha: string | null; lineas: string[] };

/**
 * A3ERP guarda las observaciones como un histórico en texto libre. Se separa por
 * líneas en blanco; si la anotación empieza por una fecha (varios formatos), se
 * saca aparte para poder mostrarla como etiqueta.
 */
function partirObservaciones(texto: string): Anotacion[] {
  return texto
    .split(/\n\s*\n/)
    .map((bloque) => bloque.trim())
    .filter(Boolean)
    .map((bloque) => {
      const m = bloque.match(
        /^(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{8,9}|[a-záéíóúñ]+-\d{2})\s*:?\s*([\s\S]*)$/i,
      );
      const cuerpo = m ? m[2] : bloque;
      return {
        fecha: m ? m[1] : null,
        lineas: cuerpo.split('\n').map((l) => l.trim()).filter(Boolean),
      };
    });
}

/** Líneas que son cabecera de un correo pegado en A3ERP. */
const CABECERA_CORREO = /^(assumpte|asunto|subject|data|fecha|date|de|from|para|to|a|empresa|cc)\s*:/i;

export default async function FichaClientePage({ params }: { params: { id: string } }) {
  // La empresa sale del propio cliente, no del selector: así se abre bien una ficha
  // de FUX o DOT aunque el selector esté en SF.
  const empresaCookie = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = (await getCodigoEmpresaDeCliente(params.id)) ?? empresaCookie;
  const d = await getFichaCliente(empresa, params.id, ANIO);
  if (!d) notFound();
  const [crossSell, contactos, empresaData, pedidos, precios, reuniones, seguimiento] = await Promise.all([
    getCrossSell(empresa, params.id, ANIO),
    getContactosCliente(params.id),
    getEmpresaPorCodigo(empresa),
    getPedidosCliente(params.id),
    getPreciosCliente(d.cliente.codigoErp),
    getReunionesCliente(params.id),
    getSeguimientoCliente(params.id),
  ]);

  const barras = d.historico.map((m) => ({ etiqueta: m.mes, valor: Math.max(0, m.neta), titulo: `${m.mes}: ${eur(m.neta)}` }));

  return (
    <div>
      <p className="breadcrumb">
        <Link href="/clientes">Clientes</Link> · Ficha 360º
      </p>
      <nav style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '4px 0 14px', fontSize: 13 }}>
        <a href="#resumen" className="enlace">Resumen</a>
        <a href="#pedidos" className="enlace">Pedidos ({pedidos.length})</a>
        <a href="#tarifas" className="enlace">Tarifas y precios</a>
        <a href="#seguimiento" className="enlace">Seguimiento ({seguimiento.eventos.length})</a>
        <a href="#reuniones" className="enlace">Reuniones ({reuniones.length})</a>
        <a href="#contactos" className="enlace">Contactos ({contactos.length})</a>
      </nav>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <h1 style={{ marginBottom: 6 }}>{d.cliente.nombre}</h1>
        <Link href={`/agenda?cliente=${d.cliente.id}#nueva`} className="boton">Agendar reunión</Link>
      </div>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        {d.cliente.codigoErp && <>Ref. {d.cliente.codigoErp} · </>}
        {d.cliente.cif && <>CIF {d.cliente.cif} · </>}
        {d.cliente.provincia || d.cliente.pais}
        {d.cliente.comercial && <> · Comercial: {d.cliente.comercial}</>}
        {d.cliente.grupo && <> · Grupo: {d.cliente.grupo}</>}
        {' · '}<span className={d.cliente.estado === 'activo' ? 'badge listo' : 'badge construccion'}>{d.cliente.estado}</span>
      </p>

      {(d.cliente.nombreFiscal || d.cliente.direccion || d.cliente.telefono || d.cliente.email) && (
        <div className="card">
          <h2>Datos de contacto</h2>
          <ul className="tablas" style={{ maxWidth: 760 }}>
            {d.cliente.nombreFiscal && d.cliente.nombreFiscal !== d.cliente.nombre && (
              <li>Nombre fiscal: {d.cliente.nombreFiscal}</li>
            )}
            {d.cliente.direccion && <li>{d.cliente.direccion}{d.cliente.poblacion ? `, ${d.cliente.poblacion}` : ''}</li>}
            {d.cliente.provincia && <li>Provincia: {d.cliente.provincia}{d.cliente.pais ? ` · ${d.cliente.pais}` : ''}</li>}
            {d.cliente.personaContacto && <li>Persona de contacto: {d.cliente.personaContacto}</li>}
            {d.cliente.telefono && <li>Teléfono: {d.cliente.telefono}</li>}
            {d.cliente.email && <li>Email: {d.cliente.email}</li>}
            {d.cliente.formaPago && <li>Forma de pago: {d.cliente.formaPago}{d.cliente.diasPago != null ? ` (${d.cliente.diasPago} días)` : ''}</li>}
            {d.cliente.tarifaCodigo && <li>Tarifa asignada: {d.cliente.tarifaCodigo}</li>}
            {d.cliente.riesgoConcedido != null && (
              <li>
                Riesgo concedido: {eur(d.cliente.riesgoConcedido)}
                {d.cliente.riesgoActual != null ? ` · pendiente actual: ${eur(d.cliente.riesgoActual)}` : ''}
              </li>
            )}
          </ul>
        </div>
      )}


      {d.cliente.observaciones ? (() => {
        const anotaciones = partirObservaciones(d.cliente.observaciones);
        return (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Observaciones (A3ERP)</h2>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {anotaciones.length} anotaci{anotaciones.length === 1 ? 'ón' : 'ones'}
              </span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 12px' }}>
              Histórico que el equipo ha ido dejando en A3ERP. Se muestra tal cual.
            </p>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 420, overflowY: 'auto' }}>
              {anotaciones.map((a, i) => (
                <li
                  key={i}
                  style={{
                    borderLeft: '3px solid var(--border-2)',
                    padding: '6px 0 10px 12px',
                    marginBottom: 10,
                  }}
                >
                  {a.fecha ? (
                    <div
                      style={{
                        display: 'inline-block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--muted)',
                        border: '1px solid var(--border-2)',
                        borderRadius: 999,
                        padding: '1px 8px',
                        marginBottom: 6,
                      }}
                    >
                      {a.fecha}
                    </div>
                  ) : null}
                  {a.lineas.map((linea, j) => (
                    <div
                      key={j}
                      style={
                        CABECERA_CORREO.test(linea)
                          ? { color: 'var(--tenue)', fontSize: 12, lineHeight: 1.5 }
                          : { fontSize: 13, lineHeight: 1.55 }
                      }
                    >
                      {linea}
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          </div>
        );
      })() : null}

      <div className="card" id="pedidos">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Últimos pedidos</h2>
          {pedidos.length > 0 ? (
            <BotonExportar
              nombre={`pedidos-${d.cliente.nombre.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`}
              cabeceras={['Pedido', 'Fecha', 'Estado', 'Total', 'Líneas']}
              filas={pedidos.map((p) => [p.numero, p.fecha, p.estado, p.total, p.lineas.length])}
            />
          ) : null}
        </div>
        {pedidos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin pedidos registrados.</p>
        ) : (
          pedidos.map((p) => (
            <details key={p.id} style={{ borderTop: '1px solid var(--border-2)', padding: '8px 0' }}>
              <summary style={{ cursor: 'pointer', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{p.numero ?? '—'}</strong>
                <span style={{ color: 'var(--muted)' }}>{p.fecha}</span>
                <span className="badge listo">{p.estado}</span>
                <span style={{ marginLeft: 'auto' }} className="td-num">
                  {p.total === null ? '—' : eur(p.total)} · {p.lineas.length} líneas
                </span>
              </summary>
              {p.lineas.length === 0 ? (
                <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>Sin detalle de líneas cargado.</p>
              ) : (
                <table className="tabla" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Descripción</th>
                      <th className="td-num">Uds.</th>
                      <th className="td-num">Precio</th>
                      <th className="td-num">Dto.</th>
                      <th className="td-num">Importe</th>
                      <th>Lote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lineas.map((l) => (
                      <tr key={l.id}>
                        <td>{l.codigo ?? '—'}</td>
                        <td>{l.descripcion ?? '—'}</td>
                        <td className="td-num">{decimal(l.cantidad)}</td>
                        <td className="td-num">{eur(l.precio)}</td>
                        <td className="td-num">{l.descuento ? `${l.descuento}%` : '—'}</td>
                        <td className="td-num">{eur(l.importe)}</td>
                        <td>{l.lote ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </details>
          ))
        )}
      </div>

      <div className="card" id="tarifas">
        <h2>Tarifas y precios</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Tarifa asignada: <strong>{d.cliente.tarifaCodigo ?? '—'}</strong>
          {d.cliente.formaPago ? <> · Forma de pago: <strong>{d.cliente.formaPago}</strong></> : null}
        </p>
        {precios.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin precios especiales para este cliente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="td-num">Precio</th>
                <th className="td-num">Desde uds.</th>
                <th>Vigencia</th>
              </tr>
            </thead>
            <tbody>
              {precios.map((p, i) => (
                <tr key={`${p.articulo}-${i}`}>
                  <td>{p.articulo ?? '—'}</td>
                  <td className="td-num">{eur(p.precio)}</td>
                  <td className="td-num">{p.unidades === null ? '—' : decimal(p.unidades)}</td>
                  <td>{p.desde ?? '—'} → {p.hasta ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" id="reuniones">
        <h2>Reuniones</h2>
        {reuniones.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin reuniones registradas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Asunto</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reuniones.map((r) => (
                <tr key={r.id}>
                  <td>{r.fecha}{r.hora ? ` ${r.hora.slice(0, 5)}` : ''}</td>
                  <td>{r.asunto}</td>
                  <td>{r.contacto ?? '—'}</td>
                  <td><span className="badge listo">{r.estado ?? 'programada'}</span></td>
                  <td><Link href={`/agenda/${r.id}`} className="enlace">Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PanelSeguimiento
        clienteId={d.cliente.id}
        empresaId={empresaData.id}
        eventos={seguimiento.eventos}
        alertas={seguimiento.alertas}
      />

      <div id="contactos">
        <EditorContactosCliente clienteId={d.cliente.id} empresaId={empresaData.id} contactos={contactos} />
      </div>

      <div id="resumen"></div>
      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación neta ${d.anio}`} valor={eur(d.neta)} nota={d.deltaPct === null ? 'sin dato previo' : `vs ${d.anio - 1}: ${pct(d.deltaPct)}`} />
        <Kpi etiqueta="Facturas" valor={numero(d.facturas)} nota={`${numero(d.unidades)} unidades`} />
        <Kpi etiqueta="Ticket medio" valor={eur(d.ticketMedio)} nota="por factura" />
        <Kpi etiqueta="Saldo pendiente" valor={eur(d.saldo)} nota={`${eur(d.vencido)} vencido`} />
        <Kpi etiqueta="DSO del cliente" valor={d.dsoDias === null ? '—' : `${decimal(d.dsoDias)} días`} nota="últimos 12 meses" />
      </ul>

      <div className="card">
        <h2>Evolución de compras (15 meses)</h2>
        <GraficoBarras series={barras} formato={eur} leyenda={{ a: 'Compras netas' }} />
      </div>

      <div className="card">
        <h2>Top artículos comprados {d.anio}</h2>
        {d.topArticulos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin compras de artículos en el ejercicio.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="td-num">Unidades</th>
                <th className="td-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.topArticulos.map((a, i) => (
                <tr key={i}>
                  <td>{a.nombre}</td>
                  <td className="td-num">{numero(a.unidades)}</td>
                  <td className="td-num">{eur(a.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Cross-sell por afinidad de familias</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Familias que compran clientes similares y que este cliente aún no compra, con la
          co-ocurrencia ponderada sobre sus propias familias.
        </p>
        {crossSell.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin compras de familias registradas para este cliente en {d.anio}.</p>
        ) : (
          <div className="grid-cards">
            {crossSell.map((r) => (
              <div key={r.familia} className="card-tarjeta">
                <h3>{r.familia}</h3>
                <span className="badge pendiente">{decimal(r.afinidad)} % afinidad</span>
                <ul className="tablas">
                  {r.articulos.map((a) => (
                    <li key={a.nombre}>{a.nombre} <span className="td-num">({numero(a.veces)} uds)</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Últimas facturas</h2>
        {d.ultimasFacturas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin facturas registradas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Número</th>
                <th className="td-num">Importe</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {d.ultimasFacturas.map((f) => (
                <tr key={f.id}>
                  <td>{f.fecha}</td>
                  <td>{f.numero ?? '—'}</td>
                  <td className="td-num">{eur(f.importe)}</td>
                  <td>{f.tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}