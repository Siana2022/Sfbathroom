'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Reparto = {
  total: number;
  habitual: number;
  nuevo: number;
  seguimiento: number;
  ganado: number;
  perdido: number;
  sinEstado: number;
};

/**
 * Reparto de la cartera por estado CRM, pinchable.
 *
 * Con una cartera de cientos de clientes, saber "cuántos están en seguimiento"
 * obligaba a bajar por el listado y contarlos a ojo. Aquí el estado se ve de un
 * golpe y cada número lleva al listado ya filtrado por ese estado.
 *
 * "Sin estado" no es un estado CRM más: son los clientes que aún no se han
 * clasificado. Se enseña porque es la lista de trabajo pendiente, y sin él los
 * números no cuadrarían con el total de la cartera.
 *
 * El filtro vive en la URL, como el resto, para que el enlace sea compartible.
 */
const ESTADOS: { clave: keyof Omit<Reparto, 'total'>; etiqueta: string; param: string }[] = [
  { clave: 'habitual', etiqueta: 'Habitual', param: 'estado=habitual' },
  { clave: 'nuevo', etiqueta: 'Nuevo', param: 'estado=nuevo' },
  { clave: 'seguimiento', etiqueta: 'En seguimiento', param: 'estado=seguimiento' },
  { clave: 'ganado', etiqueta: 'Ganado', param: 'estado=ganado' },
  { clave: 'perdido', etiqueta: 'Perdido', param: 'estado=perdido' },
  { clave: 'sinEstado', etiqueta: 'Sin estado', param: 'sinestado=1' },
];

function ResumenEstadosInner({ reparto }: { reparto: Reparto }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const estadoActivo = sp.get('estado');
  const sinEstadoActivo = sp.get('sinestado') === '1';

  function filtrar(param: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete('estado');
    params.delete('sinestado');
    // Volver a pinchar el estado ya activo lo quita: es el gesto natural.
    const yaActivo = param === 'sinestado=1' ? sinEstadoActivo : estadoActivo === param.split('=')[1];
    if (!yaActivo) {
      const [clave, valor] = param.split('=');
      params.set(clave, valor);
    }
    // Cambiar de filtro invalida la página en la que estaba.
    params.delete('pagina');
    // El reparto es de la cartera: si estaba en otra pestaña, esto lo trae aquí.
    params.delete('vista');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="resumen-estados">
      <span className="resumen-estados-titulo">Estado de la cartera</span>
      {ESTADOS.map((e) => {
        const activo = e.param === 'sinestado=1' ? sinEstadoActivo : estadoActivo === e.param.split('=')[1];
        return (
          <button
            key={e.clave}
            type="button"
            className={`chip-estado${activo ? ' activo' : ''}`}
            onClick={() => filtrar(e.param)}
            disabled={reparto[e.clave] === 0}
            title={`Ver los ${reparto[e.clave]} clientes en "${e.etiqueta.toLowerCase()}"`}
          >
            {e.etiqueta}
            <strong>{reparto[e.clave]}</strong>
          </button>
        );
      })}
    </div>
  );
}

export default function ResumenEstados(props: { reparto: Reparto }) {
  return (
    <Suspense fallback={null}>
      <ResumenEstadosInner {...props} />
    </Suspense>
  );
}
