import { cookies } from 'next/headers';
import { getContactos } from '@/lib/datos/comercial';
import { numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';

export const dynamic = 'force-dynamic';

type SearchParams = { [key: string]: string | string[] | undefined };

function uno(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Contactos con filtro por territorio: la base de los envíos masivos. */
export default async function ContactosPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const pais = uno(searchParams.pais);
  const provincia = uno(searchParams.provincia);
  const sinEmail = uno(searchParams.sinEmail) === '1';
  const d = await getContactos(empresa, { pais, provincia, sinEmail });

  return (
    <div>
      <p className="breadcrumb">Acceso comercial · Contactos</p>
      <h1>Contactos</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 820 }}>
        Personas de contacto por cliente, con país y provincia para poder segmentar envíos masivos.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Contactos" valor={numero(d.filas.length)} nota={pais || provincia ? 'filtrado' : 'total'} />
        <Kpi etiqueta="Con email" valor={numero(d.filas.filter((f) => f.email).length)} />
        <Kpi etiqueta="Sin email" valor={numero(d.filas.filter((f) => !f.email).length)} nota="no recibirán masivos" />
        <Kpi etiqueta="Países" valor={numero(d.porPais.length)} />
      </ul>

      <div className="card">
        <h2>Filtrar por territorio</h2>
        <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            País
            <select className="input-dato" name="pais" defaultValue={pais ?? ''}>
              <option value="">Todos</option>
              {d.porPais.map((p) => (
                <option key={p.pais} value={p.pais}>{p.pais} ({p.n})</option>
              ))}
            </select>
          </label>
          <label>
            Provincia
            <select className="input-dato" name="provincia" defaultValue={provincia ?? ''}>
              <option value="">Todas</option>
              {d.porProvincia.map((p) => (
                <option key={p.provincia} value={p.provincia}>{p.provincia} ({p.n})</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" name="sinEmail" value="1" defaultChecked={sinEmail} />
            Solo sin email
          </label>
          <button className="btn" type="submit">Aplicar</button>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2>Listado · {d.empresa.nombre}</h2>
          <DescargarExcel
            nombre={`contactos-${pais ?? 'todos'}-${provincia ?? 'todas'}`}
            columnas={['Cliente', 'Nombre', 'Apellidos', 'Cargo', 'Email', 'Teléfono', 'País', 'Provincia']}
            registros={d.filas.map((f) => [f.cliente, f.nombre, f.apellidos ?? '', f.cargo ?? '', f.email ?? '', f.telefono ?? '', f.pais ?? '', f.provincia ?? ''])}
          />
        </div>
        {d.filas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin contactos para los filtros seleccionados.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Cargo</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>País</th>
                  <th>Provincia</th>
                </tr>
              </thead>
              <tbody>
                {d.filas.map((f) => (
                  <tr key={f.id}>
                    <td>{f.cliente}</td>
                    <td><strong>{f.nombre}</strong>{f.apellidos ? ` ${f.apellidos}` : ''}</td>
                    <td>{f.cargo ?? '—'}</td>
                    <td>{f.email ?? '—'}</td>
                    <td>{f.telefono ?? '—'}</td>
                    <td>{f.pais ?? '—'}</td>
                    <td>{f.provincia ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
