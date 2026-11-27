import { cookies } from 'next/headers';
import Link from 'next/link';
import { getClientes, getClientesFusionados } from '@/lib/datos/clientes';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur, numero } from '@/lib/formato';
import KpisClientes from '@/components/KpisClientes';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import { ANIO_ACTUAL } from '@/lib/ejercicio';
import { getUsuario } from '@/lib/datos/role';
import { EMPRESAS } from '@/lib/empresas';


const ANIO = ANIO_ACTUAL;


/** Crecimiento de la facturación frente al año anterior (null si no había base). */
function crecimiento(neta: number, previa: number): number | null {
  return previa > 0 ? ((neta - previa) / previa) * 100 : null;
}

function colorCrecimiento(neta: number, previa: number): { color: string } | undefined {
  const v = crecimiento(neta, previa);
  if (v === null || v === 0) return undefined;
  return { color: v > 0 ? 'var(--verde)' : 'var(--rojo)' };
}

function textoCrecimiento(neta: number, previa: number): string {
  const v = crecimiento(neta, previa);
  if (v === null) return '—';
  return `${v > 0 ? '+' : ''}${decimal(v)} %`;
}

/** Chips para acotar por empresa sin tocar el selector de la cabecera. */
function ChipsEmpresa({ actual, searchParams }: { actual: string | null; searchParams: SearchParams }) {
  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (k !== 'empresa' && typeof v === 'string') base.set(k, v);
  }
  const href = (codigo?: string) => {
    const p = new URLSearchParams(base);
    if (codigo) p.set('empresa', codigo);
    const qs = p.toString();
    return qs ? `/clientes?${qs}` : '/clientes';
  };
  const opciones = [{ codigo: null as string | null, etiqueta: 'Todas' }, ...EMPRESAS.map((e) => ({ codigo: e.codigo as string | null, etiqueta: e.codigo }))];
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Empresa:</span>
      {opciones.map((o) => (
        <Link
          key={o.etiqueta}
          href={href(o.codigo ?? undefined)}
          className={`boton${(actual ?? null) === o.codigo ? ' boton-primario' : ''}`}
        >
          {o.etiqueta}
        </Link>
      ))}
    </div>
  );
}

export default async function ClientesPage({ searchParams }: { searchParams: SearchParams }) {
  const empresaCookie = cookies().get('sfb_empresa')?.value ?? 'SF';
  const usuario = await getUsuario();
  const esComercial = usuario?.rol === 'comercial';
  const empresaParam = EMPRESAS.find((e) => e.codigo === searchParams?.empresa)?.codigo ?? null;
  const filtros = parseFiltros(searchParams);

  // El comercial ve por defecto las tres empresas juntas (listado consolidado) y
  // puede acotar a una con las pestañas, sin tocar el selector de la cabecera.
  const fusionado = esComercial && !empresaParam;
  if (fusionado) {
    const f = await getClientesFusionados(ANIO, filtros);
    return (
      <div>
        <p className="breadcrumb">Cuadro mando comercial · Bloque 6</p>
        <h1>Clientes · las tres empresas</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Facturación y margen de tus clientes de SF, FUX y DOT en {ANIO}. Elige una empresa para
          ver el análisis completo (semáforo, evolución y matriz).
        </p>

        <ChipsEmpresa actual={null} searchParams={searchParams} />

        <KpisClientes
          anio={f.anio}
          activos12m={f.activos12m}
          retencion={f.retencion}
          nuevos={f.nuevos}
          recuperados={f.recuperados}
          inactivos={f.inactivos}
          perdidos={f.perdidos}
          listas={f.listas}
        />

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Clientes por facturación {f.anio}</h2>
            <DescargarExcel
              nombre={`clientes-${ANIO}`}
              columnas={['Empresa', 'Cliente', 'Comercial', 'Facturación', `Crecimiento vs ${f.anio - 1} %`, 'Margen', 'Ticket medio']}
              registros={f.tabla.map((c) => [
                c.empresa,
                c.nombre,
                c.comercial ?? '',
                c.neta.toFixed(2),
                crecimiento(c.neta, c.netaPrev)?.toFixed(2) ?? '',
                c.margen.toFixed(2),
                c.ticket.toFixed(2),
              ])}
            />
          </div>
          {f.tabla.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Sin facturación en el ejercicio.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Cliente</th>
                  <th>Comercial</th>
                  <th className="td-num">Facturación neta</th>
                  <th className="td-num">Margen</th>
                  <th className="td-num" title={`Crecimiento frente a ${f.anio - 1}`}>% vs {f.anio - 1}</th>
                  <th className="td-num">Ticket medio</th>
                </tr>
              </thead>
              <tbody>
                {f.tabla.map((c) => (
                  <tr key={`${c.empresa}-${c.id}`}>
                    <td><span className="badge">{c.empresa}</span></td>
                    <td><Link href={`/clientes/${c.id}`} className="enlace">{c.nombre}</Link></td>
                    <td>{c.comercial ?? '—'}</td>
                    <td className="td-num">{eur(c.neta)}</td>
                    <td className="td-num">{eur(c.margen)}</td>
                    <td className="td-num" style={colorCrecimiento(c.neta, c.netaPrev)}>
                      {textoCrecimiento(c.neta, c.netaPrev)}
                    </td>
                    <td className="td-num">{eur(c.ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  const empresa = empresaParam ?? empresaCookie;
  const [opciones, d] = await Promise.all([
    getOpcionesFiltros(empresa),
    getClientes(empresa, ANIO, filtros),
  ]);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 6</p>
      <h1>Comportamiento de cliente</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Clientes activos, nuevos y perdidos de {d.empresa.nombre}, retención entre {ANIO - 1} y
        {d.anio}.
      </p>

      {esComercial ? <ChipsEmpresa actual={empresa} searchParams={searchParams} /> : null}

      <Filtros opciones={opciones} />

      <KpisClientes
        anio={d.anio}
        activos12m={d.activos12m}
        retencion={d.retencion}
        nuevos={d.nuevos}
        recuperados={d.recuperados}
        inactivos={d.inactivos}
        perdidos={d.perdidos}
        listas={d.listas}
      />

      <div className="card">
        <h2>Semáforo de fuga</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Clientes activos con días sin pedir por encima de su frecuencia histórica. Rojo:
          más de 2,5 veces su frecuencia habitual. Ámbar: entre su frecuencia y 2,5 veces.
        </p>
        {d.semaforo.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Ningún cliente activo está por encima de su frecuencia habitual.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Días sin pedir</th>
                <th className="td-num">Frecuencia habitual</th>
                <th>Semáforo</th>
              </tr>
            </thead>
            <tbody>
              {d.semaforo.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{numero(c.diasSin)}</td>
                  <td className="td-num">{c.frecuencia === null ? '—' : `${decimal(c.frecuencia)} días`}</td>
                  <td>
                    <span className={c.nivel === 'aviso' ? 'badge pendiente' : 'badge construccion'}>
                      {c.nivel === 'aviso' ? 'ámbar' : 'rojo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Clientes sin actividad en más de 12 meses</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Clientes sin facturar desde hace más de 12 meses, con su comercial asignado.
          Candidatos a reactivación (o a su clasificación como perdidos).
        </p>
        {d.noActivos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Todos los clientes activos han facturado en los últimos 12 meses.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Comercial</th>
                <th className="td-num">Días sin facturar</th>
                <th>Última factura</th>
              </tr>
            </thead>
            <tbody>
              {d.noActivos.map((c) => (
                <tr key={c.nombre}>
                  <td><Link href={`/clientes/${c.id}`} className="enlace">{c.nombre}</Link></td>
                  <td>{c.comercial ?? '—'}</td>
                  <td className={`td-num ${c.diasSin > 365 ? 'td-pos' : ''}`}>{numero(c.diasSin)}</td>
                  <td>{c.ultimaFactura}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Evolución por cliente: últimos 12M frente a los 12M previos</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Top de variación (ganadores y zonas de caída) para priorizar el plan de visita.
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="td-num">Neta 12M</th>
              <th className="td-num">Neta 12M previos</th>
              <th className="td-num">Delta</th>
              <th className="td-num">Delta %</th>
            </tr>
          </thead>
          <tbody>
            {d.movimiento.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/clientes/${c.id}`} className="enlace">{c.nombre}</Link></td>
                <td className="td-num">{eur(c.netaActual)}</td>
                <td className="td-num">{eur(c.netaPrevia)}</td>
                <td className={`td-num ${c.delta < 0 ? 'td-pos' : ''}`}>{c.delta > 0 ? '+' : ''}{eur(c.delta)}</td>
                <td className={`td-num ${c.delta < 0 ? 'td-pos' : ''}`}>{c.deltaPct === null ? '—' : `${c.deltaPct > 0 ? '+' : ''}${decimal(c.deltaPct)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <DescargarExcel
            nombre="clientes-movimiento"
            columnas={['Cliente', 'Neta 12M', 'Neta 12M previos', 'Delta', 'Delta %']}
            registros={d.movimiento.map((c) => [c.nombre, c.netaActual, c.netaPrevia, c.delta, c.deltaPct])}
          />
        </div>
      </div>

      <div className="card">
        <h2>Clientes por facturación {d.anio}</h2>
        {d.tabla.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin facturación en el ejercicio.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Comercial</th>
                <th className="td-num">Facturación neta</th>
                <th className="td-num" title="Facturación neta menos coste de venta (mismo criterio que /margen).">Margen</th>
                <th className="td-num" title={`Crecimiento frente a ${d.anio - 1}`}>% vs {d.anio - 1}</th>
                <th className="td-num">Ticket medio</th>
              </tr>
            </thead>
            <tbody>
              {d.tabla.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/clientes/${c.id}`} className="enlace">{c.nombre}</Link></td>
                  <td>{c.comercial ?? '—'}</td>
                  <td className="td-num">{eur(c.neta)}</td>
                  <td className="td-num">{eur(c.margen)}</td>
                  <td className="td-num" style={colorCrecimiento(c.neta, c.netaPrev)}>
                    {textoCrecimiento(c.neta, c.netaPrev)}
                  </td>
                  <td className="td-num">{eur(c.ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Matriz cliente × familia</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Familias compradas por cada cliente del top {d.matriz.length} por facturación en {d.anio}.
          Es el mapa de venta cruzada y, a la vez, el de vulnerabilidad: lo que un cliente no
          compra hoy es la oportunidad y también la exposición.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Neta</th>
                {d.familias.map((f) => (
                  <th key={f} title={f}>{f.length > 12 ? `${f.slice(0, 12)}…` : f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.matriz.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{eur(c.neta)}</td>
                  {c.compradas.map((s, i) => (
                    <td key={d.familias[i]} style={{ textAlign: 'center' }}>
                      <span className={s ? 'badge listo' : 'badge vacio'}>
                        {s ? '✓' : '·'}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}