import { getConfiguracion } from '@/lib/datos/configuracion';
import EditorUmbrales from '@/components/EditorUmbrales';
import PushSuscripcion from '@/components/PushSuscripcion';


export default async function ConfiguracionPage() {
  const d = await getConfiguracion();

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Configuración</p>
      <h1>Configuración</h1>

      <div className="card">
        <h2>Mis avisos en este dispositivo</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Recibe el resumen diario y las alertas como notificación push del navegador (PWA),
          además del correo. Requiere claves VAPID del servidor y aceptar el permiso.
        </p>
        <PushSuscripcion />
      </div>

      {!d.puedesEditar ? (
        <div className="card">
          <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
            La edición de umbrales está restringida a dirección y administradores. Tu rol actual es{' '}
            <strong>{d.rol ?? 'sin sesión'}</strong>.
          </p>
        </div>
      ) : (
        <div className="card">
          <EditorUmbrales umbrales={d.umbrales} />
        </div>
      )}
    </div>
  );
}