import { getConfiguracion } from '@/lib/datos/configuracion';
import EditorUmbrales from '@/components/EditorUmbrales';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const d = await getConfiguracion();

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Configuración</p>
      <h1>Configuración de umbrales</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Umbrales de las alertas del cuadro de mando (decisiones Q6 y Q8–Q19 del cuestionario). Los
        cambios se aplican de inmediato a las señales del buzón de alertas.
      </p>

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