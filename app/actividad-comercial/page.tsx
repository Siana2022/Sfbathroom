import { cookies } from 'next/headers';
import { getActividad } from '@/lib/datos/actividad';
import { eur2, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';

export const dynamic = 'force-dynamic';

const ANIO = 2026;

export default async function ActividadComercialPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const d = await getActividad(empresa, ANIO);

  const totalNeta = d.comerciales.reduce((a, c) => a + c.neta, 0);

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 9</p>
      <h1>Actividad comercial</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Carga por persona de {d.empresa.nombre} en {d.anio}: facturación gestionada, clientes
        activos, descuentos aplicados y pedidos.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta={`Facturación gestionada ${d.anio}`} valor={numero(totalNeta)} nota={`${d.comerciales.length} comerciales activos`} />
      </ul>

      <div className="card">
        <h2>Carga por comercial</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Comercial</th>
              <th className="td-num">Facturación</th>
              <th className="td-num">Facturas</th>
              <th className="td-num">Clientes activos</th>
              <th className="td-num">Descuento medio</th>
              <th className="td-num">Pedidos</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}