'use client';
import { useRouter, useSearchParams } from 'next/navigation';

type Props = {
  comerciales: { id: string; nombre: string }[];
  actual: string | null;
};

/**
 * Selector de cartera para dirección: acota el panel entero a un comercial.
 * Escribe en la URL (como el resto de filtros) para que el enlace sea
 * compartible y el estado sobreviva a un refresco.
 */
export default function SelectorComercial({ comerciales, actual }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function cambiar(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('comercial', id);
    else params.delete('comercial');
    // Al cambiar de cartera la paginación deja de tener sentido.
    params.delete('pagina');
    const qs = params.toString();
    router.push(qs ? `/comercial?${qs}` : '/comercial');
  }

  return (
    <label className="campo-filtro">
      Cartera
      <select className="input-dato" value={actual ?? ''} onChange={(e) => cambiar(e.target.value)}>
        <option value="">Toda la empresa</option>
        {comerciales.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
