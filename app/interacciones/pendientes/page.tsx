import { getInteraccionesPendientes } from '@/lib/datos/interacciones';
import { getUsuario } from '@/lib/datos/role';
import { fecha as fechaCorta } from '@/lib/formato';
import Aviso from '@/components/Aviso';
import VincularInteraccion from '@/components/VincularInteraccion';

const ROLES = new Set(['admin', 'direccion']);

function recortar(texto: string | null | undefined, max = 160): string {
  if (!texto) return '—';
  const limpio = texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio) return '—';
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

export default async function InteraccionesPendientesPage() {
  const usuario = await getUsuario();
  if (!usuario || !ROLES.has(usuario.rol ?? '')) {
    return (
      <div>
        <p className="breadcrumb">Interacciones</p>
        <h1>Pendientes de vincular</h1>
        <Aviso tipo="info">Esta pantalla está disponible para dirección y administración.</Aviso>
      </div>
    );
  }

  const pendientes = await getInteraccionesPendientes();

  return (
    <div>
      <p className="breadcrumb">Interacciones · Importación</p>
      <h1>Pendientes de vincular</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Llamadas y notas importadas que no se pudieron cruzar con ningún cliente. Al vincularlas,
        la interacción pasa al historial de la ficha del cliente y deja de aparecer aquí.
      </p>

      {pendientes.length === 0 ? (
        <Aviso tipo="info">No hay interacciones pendientes.</Aviso>
      ) : (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{pendientes.length} sin cliente</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Título</th>
                <th>Detalle</th>
                <th>Resultado</th>
                <th>Origen</th>
                <th>Vincular a</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(p.fecha)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.tipo}</td>
                  <td>{p.asunto ?? '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{recortar(p.contenido)}</td>
                  <td>{p.resultado ?? '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {p.origen ?? '—'}
                    {p.idExterno ? <div>id {p.idExterno}</div> : null}
                  </td>
                  <td>
                    <VincularInteraccion interaccionId={p.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
