import { cookies } from 'next/headers';
import { getActividad } from '@/lib/datos/actividad';
import { eur2, numero, decimal } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function ActividadComercialPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getActividad(empresa, ANIO);

  const totalNeta = d.comerciales.reduce((a, c) => a + c.neta, 0);
  const totalPresupuesto = d.comerciales.reduce((a, c) => a + c.presupuesto, 0);
  const totalNuevos = d.comerciales.reduce((a, c) => a + c.nuevos, 0);
  const totalPerdidos = d.comerciales.reduce((a, c) => a + c.perdidos, 0);
  const saturados = d.comerciales.filter((c) => c.saturacionImporte || c.saturacionClientes).length;

  const columnas: string[] = [
    'Comercial', 'Facturación', 'Facturas', 'Clientes activos', 'Descuento medio', 'Pedidos',
    'Margen %', 'Margen €', 'Presupuesto', 'Cumplimiento %', 'Nuevos', 'Perdidos', 'Neta trim. actual', 'Saturación',
  ];
  const registros = d.comerciales.map((c) => [
    c.nombre,
    c.neta.toFixed(2),
    c.facturas,
    c.clientes,
    c.descuentoMedio.toFixed(2),
    c.pedidos,
    c.margenPct === null ? '' : c.margenPct.toFixed(2),
    c.margenAbs === null ? '' : c.margenAbs.toFixed(2),
    c.presupuesto.toFixed(2),
    c.cumplimientoPct === null ? '' : c.cumplimientoPct.toFixed(2),
    c.nuevos,
    c.perdidos,
    c.trimNeta.toFixed(2),
    c.saturacionImporte || c.saturacionClientes ? 'Sí' : 'No',
  ]);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 9</p>
      <h1>Actividad comercial</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Carga por persona de {d.empresa.nombre} en {d.anio}: facturación gestionada, clientes
        activos, descuentos, pedidos, margen aportado, cumplimiento de presupuesto, clientes
        nuevos y perdidos frente a {d.anio - 1}, y saturación del equipo.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación gestionada ${d.anio}`} valor={numero(totalNeta)} nota={`${d.comerciales.length} comerciales activos`} />
        <Kpi
          etiqueta="Cumplimiento presupuesto"
          valor={totalPresupuesto > 0 ? `${decimal((totalNeta / totalPresupuesto) * 100)} %` : '—'}
          nota={`presupuesto ${numero(totalPresupuesto)} €`}
        />
        <Kpi etiqueta="Clientes nuevos" valor={numero(totalNuevos)} nota="incorporados este ejercicio" />
        <Kpi etiqueta="Clientes perdidos" valor={numero(totalPerdidos)} nota="respecto al ejercicio anterior" />
      </ul>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Carga por comercial</h2>
          <DescargarExcel nombre={`actividad-comercial-${d.anio}`} columnas={columnas} registros={registros} etiqueta="Exportar a Excel" />
        </div>
        <table className="tabla">
          <thead>
            <tr>
              <th>Comercial</th>
              <th className="td-num">Facturación</th>
              <th className="td-num">Facturas</th>
              <th className="td-num">Clientes activos</th>
              <th className="td-num">Descuento medio</th>
              <th className="td-num">Pedidos</th>
              {!d.sinAccesoMargen && (
                <>
                  <th className="td-num">Margen</th>
                  <th className="td-num">Margen €</th>
                </>
              )}
              <th className="td-num">Presupuesto</th>
              <th className="td-num">Cumplimiento</th>
              <th className="td-num">Nuevos</th>
              <th className="td-num">Perdidos</th>
              {saturados > 0 && <th className="td-num">Saturación</th>}
            </tr>
          </thead>
          <tbody>
            {d.comerciales.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td className="td-num">{numero(c.neta)} €</td>
                <td className="td-num">{numero(c.facturas)}</td>
                <td className="td-num">{numero(c.clientes)}</td>
                <td className="td-num">{eur2(c.descuentoMedio)}</td>
                <td className="td-num">{numero(c.pedidos)}</td>
                {!d.sinAccesoMargen && (
                  <>
                    <td className="td-num">{c.margenPct === null ? '—' : `${decimal(c.margenPct)} %`}</td>
                    <td className="td-num">{c.margenAbs === null ? '—' : `${numero(c.margenAbs)} €`}</td>
                  </>
                )}
                <td className="td-num">{numero(c.presupuesto)} €</td>
                <td className="td-num">{c.cumplimientoPct === null ? '—' : `${decimal(c.cumplimientoPct)} %`}</td>
                <td className="td-num">{c.nuevos > 0 ? `+${c.nuevos}` : c.nuevos}</td>
                <td className="td-num">{c.perdidos > 0 ? `−${c.perdidos}` : c.perdidos}</td>
                {saturados > 0 && (
                  <td className="td-num">
                    {c.saturacionImporte || c.saturacionClientes
                      ? `${c.saturacionImporte ? 'importe' : ''}${c.saturacionImporte && c.saturacionClientes ? ' y ' : ''}${c.saturacionClientes ? 'clientes' : ''}`
                      : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}