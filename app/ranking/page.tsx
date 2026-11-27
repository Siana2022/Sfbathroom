import { cookies } from 'next/headers';
import { getRankingComerciales, type RankingFila } from '@/lib/datos/ranking';
import { getUsuario } from '@/lib/datos/role';
import { ANIO_ACTUAL } from '@/lib/ejercicio';
import { eur, numero, decimal, pct } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import Aviso from '@/components/Aviso';

const ANIO = ANIO_ACTUAL;
const ROLES_RANKING = new Set(['admin', 'direccion']);

/** Variación con color: verde si sube, rojo si baja. */
function colorVariacion(v: number | null): string | undefined {
  if (v === null || !Number.isFinite(v)) return undefined;
  if (v > 0) return 'var(--verde)';
  if (v < 0) return 'var(--rojo)';
  return undefined;
}

function FilaRanking({ fila, seccion }: { fila: RankingFila; seccion: boolean }) {
  return (
    <tr style={seccion ? { color: 'var(--muted)' } : undefined}>
      <td className="td-num">{fila.posicion === null ? '' : `${fila.posicion}º`}</td>
      <td style={seccion ? { paddingLeft: 28 } : undefined}>
        {seccion ? `· ${fila.nombre}` : fila.secciones.length > 0 ? <strong>{fila.nombre}</strong> : fila.nombre}
      </td>
      <td className="td-num">{eur(fila.neta)}</td>
      <td className="td-num">{fila.cuotaPct === null ? '—' : `${decimal(fila.cuotaPct, 1)} %`}</td>
      <td className="td-num" style={{ color: colorVariacion(fila.variacionPct) }}>
        {fila.variacionPct === null ? '—' : pct(fila.variacionPct)}
      </td>
      <td className="td-num">{numero(fila.unidades)}</td>
      <td className="td-num">{numero(fila.clientes)}</td>
      <td className="td-num">{numero(fila.pedidos)}</td>
      <td className="td-num">{eur(fila.ticketMedio)}</td>
      <td className="td-num">{fila.presupuesto === 0 ? '—' : eur(fila.presupuesto)}</td>
      <td className="td-num">{fila.cumplimientoPct === null ? '—' : `${decimal(fila.cumplimientoPct, 1)} %`}</td>
      <td className="td-num" title="Margen bruto sobre facturación">
        {fila.margenAbs === null ? '—' : eur(fila.margenAbs)}
      </td>
      <td className="td-num">{fila.margenPct === null ? '—' : `${decimal(fila.margenPct, 1)} %`}</td>
    </tr>
  );
}

export default async function RankingPage() {
  const usuario = await getUsuario();
  if (!usuario || !ROLES_RANKING.has(usuario.rol ?? '')) {
    return (
      <div>
        <p className="breadcrumb">Cuadro mando comercial</p>
        <h1>Ranking de comerciales</h1>
        <Aviso tipo="info">Este ranking está disponible para dirección y administración.</Aviso>
      </div>
    );
  }

  const empresaCodigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getRankingComerciales(empresaCodigo, ANIO);

  if (d.filas.length === 0) {
    return (
      <div>
        <p className="breadcrumb">Cuadro mando comercial</p>
        <h1>Ranking de comerciales</h1>
        <Aviso tipo="info">No hay comerciales con facturación en {d.anio} para {d.empresa.nombre}.</Aviso>
      </div>
    );
  }

  const tabla = d.filas.flatMap((f) => [{ fila: f, seccion: false }, ...f.secciones.map((s) => ({ fila: s, seccion: true }))]);

  const cabeceras = [
    'Posición', 'Comercial', 'Facturación', 'Cuota %', `Variación vs ${d.anio - 1} %`,
    'Unidades', 'Clientes', 'Pedidos', 'Ticket medio', 'Objetivo', 'Cumplimiento %',
    'Margen €', 'Margen %',
  ];
  const registros = tabla.map(({ fila, seccion }) => [
    seccion ? '' : fila.posicion,
    seccion ? `  ${fila.nombre}` : fila.nombre,
    fila.neta.toFixed(2),
    fila.cuotaPct === null ? '' : fila.cuotaPct.toFixed(2),
    fila.variacionPct === null ? '' : fila.variacionPct.toFixed(2),
    fila.unidades,
    fila.clientes,
    fila.pedidos,
    fila.ticketMedio.toFixed(2),
    fila.presupuesto.toFixed(2),
    fila.cumplimientoPct === null ? '' : fila.cumplimientoPct.toFixed(2),
    fila.margenAbs === null ? '' : fila.margenAbs.toFixed(2),
    fila.margenPct === null ? '' : fila.margenPct.toFixed(2),
  ]);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Dirección</p>
      <h1>Ranking de comerciales · {d.empresa.nombre}</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 780 }}>
        Clasificación completa del equipo en {d.anio} por facturación neta: cuota sobre el total,
        variación frente a {d.anio - 1}, unidades, cartera atendida, pedidos, ticket medio,
        cumplimiento de objetivo y margen aportado.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación del equipo ${d.anio}`} valor={eur(d.totalNeta)} nota={`${numero(d.totalFacturas)} facturas`} />
        <Kpi
          etiqueta={`Variación vs ${d.anio - 1}`}
          valor={d.variacionEquipoPct === null ? '—' : pct(d.variacionEquipoPct)}
          nota={`${eur(d.totalNetaPrev)} el año anterior`}
        />
        <Kpi etiqueta="Media por comercial" valor={eur(d.media)} nota={`${d.filas.length} comerciales`} />
        <Kpi etiqueta="Mediana" valor={eur(d.mediana)} nota="comercial en la posición central" />
        <Kpi etiqueta="Unidades facturadas" valor={numero(d.totalUnidades)} nota="suma del equipo" />
      </ul>

      {d.filas.some((f) => f.presupuesto === 0) && (
        <Aviso tipo="info">
          Algún comercial no tiene objetivo cargado en {d.anio}: su cumplimiento aparece vacío hasta
          que se importe en Objetivos por comercial.
        </Aviso>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Clasificación completa</h2>
          <DescargarExcel
            nombre={`ranking-comerciales-${d.empresa.codigo}-${d.anio}`}
            columnas={cabeceras}
            registros={registros}
            etiqueta="Exportar a Excel"
          />
        </div>
        <table className="tabla">
          <thead>
            <tr>
              <th className="td-num">Pos.</th>
              <th>Comercial</th>
              <th className="td-num">Facturación</th>
              <th className="td-num">Cuota</th>
              <th className="td-num">vs {d.anio - 1}</th>
              <th className="td-num">Unidades</th>
              <th className="td-num">Clientes</th>
              <th className="td-num">Pedidos</th>
              <th className="td-num">Ticket medio</th>
              <th className="td-num">Objetivo</th>
              <th className="td-num">Cumplimiento</th>
              <th className="td-num">Margen</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {tabla.map(({ fila, seccion }) => (
              <FilaRanking key={`${seccion ? 's' : 'c'}-${fila.nombre}`} fila={fila} seccion={seccion} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>
                <strong>Total equipo</strong>
              </td>
              <td className="td-num">
                <strong>{eur(d.totalNeta)}</strong>
              </td>
              <td className="td-num">100 %</td>
              <td className="td-num" style={{ color: colorVariacion(d.variacionEquipoPct) }}>
                {d.variacionEquipoPct === null ? '—' : pct(d.variacionEquipoPct)}
              </td>
              <td className="td-num">{numero(d.totalUnidades)}</td>
              <td className="td-num" colSpan={7} />
            </tr>
          </tfoot>
        </table>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>
          Facturación neta (base imponible). Los grupos STARBATH y BIGMAT suman a sus secciones.
          {d.sinAccesoMargen ? ' El margen solo se muestra a perfiles con acceso a márgenes.' : ''}
        </p>
      </div>
    </div>
  );
}
