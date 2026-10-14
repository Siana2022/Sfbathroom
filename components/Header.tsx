'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CampanaNotificaciones from '@/components/CampanaNotificaciones';
import BuscadorGlobal from '@/components/BuscadorGlobal';
import FrescuraDatos from '@/components/FrescuraDatos';

const empresas = [
  { codigo: 'SF', nombre: 'SF Bathroom' },
  { codigo: 'DOT', nombre: 'DOT Surfaces' },
  { codigo: 'FUX', nombre: 'Fuxsabany' },
];

export default function Header({ rol }: { rol?: string }) {
  const [empresa, setEmpresa] = useState('SF');
  const router = useRouter();

  useEffect(() => {
    const desdeCookie = document.cookie.split('; ').find((c) => c.startsWith('sfb_empresa='))?.split('=')[1];
    const guardada = desdeCookie || localStorage.getItem('sfb_empresa');
    if (guardada) setEmpresa(guardada);
  }, []);

  function cambiarEmpresa(codigo: string) {
    setEmpresa(codigo);
    localStorage.setItem('sfb_empresa', codigo);
    document.cookie = `sfb_empresa=${codigo}; path=/; max-age=2592000; SameSite=Lax`;
    // Limpia los filtros de la empresa anterior (si los hay): cambiar la URL fuerza
    // un fetch del RSC con la cookie nueva.
    if (window.location.search) router.replace(window.location.pathname);
    // router.replace a la MISMA URL no re-ejecuta los server components (la caché del
    // router devuelve el payload del segmento). refresh() descarta esa caché y vuelve a
    // renderizar la página en servidor, re-leyendo la cookie sfb_empresa. Sin recarga completa.
    router.refresh();
  }

  const hoy = new Date().toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="topbar">
      <span className="breadcrumb">
        <strong>sfbathroom · BI</strong>
      </span>
      <div className="topbar-derecha">
        <FrescuraDatos empresa={empresa} />
        <BuscadorGlobal />
        <span className="topbar-fecha">{hoy}</span>
        <select
          aria-label="Empresa"
          value={empresa}
          onChange={(e) => cambiarEmpresa(e.target.value)}
          className="selector-empresa"
        >
          {empresas.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.nombre}
            </option>
          ))}
</select>
          <CampanaNotificaciones />
          {rol && <span className="badge rol">{rol}</span>}
      </div>
    </header>
  );
}