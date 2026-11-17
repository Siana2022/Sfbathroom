import { cookies } from 'next/headers';
import { getConfiguracion, getObjetivosComercial } from '@/lib/datos/configuracion';
import { ANIO_ACTUAL } from '@/lib/ejercicio';
import EditorObjetivosComercial from '@/components/EditorObjetivosComercial';
import EditorUmbrales from '@/components/EditorUmbrales';
import PushSuscripcion from '@/components/PushSuscripcion';


export default async function ConfiguracionPage() {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const [d, objetivos] = await Promise.all([
    getConfiguracion(),
    getObjetivosComercial(empresa, ANIO_ACTUAL),
  ]);

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Configuración</p>
      <h1>Configuración</h1>

      <div className="card">
        <h2>Mis avisos en este dispositivo</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          Recibe el resumen diario y las alertas como notificación push del navegador (PWA),
          además del correo. Requiere claves VAPID del servidor y aceptar el permiso.
        </p>
        <PushSuscripcion />
      </div>

      {d.puedesEditar ? (
        <div className="card">
          <EditorObjetivosComercial empresaId={objetivos.empresaId} anio={objetivos.anio} filas={objetivos.filas} />
        </div>
      ) : null}

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