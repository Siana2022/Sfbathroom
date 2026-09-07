import { cookies } from 'next/headers';
import { getCalidad } from '@/lib/datos/calidad';
import { decimal, eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

const TIPO_LABEL: Record<string, string> = {
  rotura_transporte: 'Rotura en transporte',
  defecto_fabricacion: 'Defecto de fabricación',
  error_pedido: 'Error de pedido',
  error_expedicion: 'Error de expedición',
  rechazo_comercial: 'Rechazo comercial',
};

export default async function CalidadPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getCalidad(empresa, ANIO);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 10</p>
      <h1>Calidad y devoluciones</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Devoluciones sobre facturación e incidencias registradas por {d.empresa.nombre} en {d.anio}.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="% de devoluciones" valor={d.devolucionPct === null ? '—' : `${decimal(d.devolucionPct)} %`} nota={`importe devuelto ${eur(d.importeDevoluciones)}`} />
        <Kpi etiqueta="Incidencias registradas" valor={numero(d.incidencias)} nota={`${d.abiertas} abiertas`} />
      </ul>

      <div className="card">
        <h2>Incidencias por motivo</h2>
        {d.porTipo.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin incidencias registradas.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Motivo</th>
                <th className="td-num">Incidencias</th>
                <th className="td-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.porTipo.map((t) => (
                <tr key={t.tipo}>
                  <td>{TIPO_LABEL[t.tipo] ?? t.tipo}</td>
                  <td className="td-num">{numero(t.count)}</td>
                  <td className="td-num">{eur(t.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Clientes con más incidencias</h2>
        {d.porCliente.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin incidencias asociadas a cliente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="td-num">Incidencias</th>
                <th className="td-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.porCliente.map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td className="td-num">{numero(c.count)}</td>
                  <td className="td-num">{eur(c.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}