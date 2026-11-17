import { Fragment } from 'react';
import { cookies } from 'next/headers';
import { getActividad, type ComercialRow } from '@/lib/datos/actividad';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { eur2, numero, decimal } from '@/lib/formato';
import KpisActividad from '@/components/KpisActividad';
import DescargarExcel from '@/components/DescargarExcel';
import Filtros from '@/components/Filtros';
import Aviso from '@/components/Aviso';
import { ANIO_ACTUAL } from '@/lib/ejercicio';


const ANIO = ANIO_ACTUAL;

function FilaComercial({
  c,
  esSeccion,
  sinAccesoMargen,
  conSaturacion,
}: {
  c: ComercialRow;
  esSeccion: boolean;
  sinAccesoMargen: boolean;
  conSaturacion: boolean;
}) {
  return (
    <tr style={esSeccion ? { color: 'var(--muted)' } : undefined}>
      <td style={esSeccion ? { paddingLeft: 24 } : undefined}>
        {esSeccion ? `· ${c.nombre}` : c.secciones.length > 0 ? <strong>{c.nombre}</strong> : c.nombre}
      </td>
      <td className="td-num">{numero(c.neta)} €</td>
      <td className="td-num">{numero(c.facturas)}</td>
      <td className="td-num">{numero(c.clientes)}</td>
      <td className="td-num">{eur2(c.descuentoMedio)}</td>
      <td className="td-num">{numero(c.pedidos)}</td>
      {!sinAccesoMargen && (
        <>
          <td className="td-num">{c.margenPct === null ? '—' : `${decimal(c.margenPct)} %`}</td>
          <td className="td-num">{c.margenAbs === null ? '—' : `${numero(c.margenAbs)} €`}</td>
        </>
      )}
      <td className="td-num">{numero(c.presupuesto)} €</td>
      <td className="td-num">{c.cumplimientoPct === null ? '—' : `${decimal(c.cumplimientoPct)} %`}</td>
      <td className="td-num">{c.nuevos > 0 ? `+${c.nuevos}` : c.nuevos}</td>
      <td className="td-num">{c.perdidos > 0 ? `−${c.perdidos}` : c.perdidos}</td>
      {conSaturacion && (
        <td className="td-num">
          {c.saturacionImporte || c.saturacionClientes
            ? `${c.saturacionImporte ? 'importe' : ''}${c.saturacionImporte && c.saturacionClientes ? ' y ' : ''}${c.saturacionClientes ? 'clientes' : ''}`
            : '—'}
        </td>
      )}
    </tr>
  );
}

export default async function ActividadComercialPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const d = await getActividad(empresa, ANIO, filtros);

  const totalNeta = d.comerciales.reduce((a, c) => a + c.neta, 0);
  const totalPresupuesto = d.comerciales.reduce((a, c) => a + c.presupuesto, 0);
  // Nuevos y perdidos únicos por empresa (no sumados por comercial).
  const totalNuevos = d.listas.nuevos.length;
  const totalPerdidos = d.listas.perdidos.length;
  const saturados = d.comerciales.filter((c) => c.saturacionImporte || c.saturacionClientes).length;

  const columnas: string[] = [
    'Comercial', 'Facturación', 'Facturas', 'Clientes activos', 'Descuento medio', 'Pedidos',
    'Margen %', 'Margen €', 'Presupuesto', 'Cumplimiento %', 'Nuevos', 'Perdidos', 'Neta trim. actual', 'Saturación',
  ];
  const registros = d.comerciales.flatMap((c) => [c, ...c.secciones]).map((c) => [
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
      <p className="breadcrumb">Cuadro mando comercial · Bloque 10</p>
      <h1>Actividad comercial</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Carga por persona de {d.empresa.nombre} en {d.anio}: facturación gestionada, clientes
        activos, descuentos, pedidos, margen aportado, cumplimiento de presupuesto, clientes
        nuevos y perdidos frente a {d.anio - 1}, y saturación del equipo.
      </p>

      <Filtros opciones={opciones} />

      {totalPresupuesto === 0 && (
        <Aviso tipo="info">
          No hay presupuesto cargado para {d.anio}: la columna de cumplimiento por comercial queda
          vacía hasta que se importe el presupuesto.
        </Aviso>
      )}

      <KpisActividad
        anio={d.anio}
        totalNeta={totalNeta}
        numComerciales={d.comerciales.length}
        totalPresupuesto={totalPresupuesto}
        nuevos={totalNuevos}
        perdidos={totalPerdidos}
        comerciales={d.comerciales.map((c) => ({
          nombre: c.nombre,
          neta: c.neta,
          presupuesto: c.presupuesto,
          cumplimientoPct: c.cumplimientoPct,
        }))}
        listas={d.listas}
      />

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
              <Fragment key={c.id}>
                <FilaComercial c={c} esSeccion={false} sinAccesoMargen={d.sinAccesoMargen} conSaturacion={saturados > 0} />
                {c.secciones.map((s) => (
                  <FilaComercial
                    key={`${c.id}-${s.id}`}
                    c={s}
                    esSeccion
                    sinAccesoMargen={d.sinAccesoMargen}
                    conSaturacion={saturados > 0}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}