'use client';
import { useEffect, useState } from 'react';

const empresas = [
  { codigo: 'SF', nombre: 'SF Bathroom' },
  { codigo: 'DOT', nombre: 'DOT Surfaces' },
  { codigo: 'FUX', nombre: 'Fuxsabany' },
];

export default function Header({ rol }: { rol?: string }) {
  const [empresa, setEmpresa] = useState('SF');

  useEffect(() => {
    const desdeCookie = document.cookie.split('; ').find((c) => c.startsWith('sfb_empresa='))?.split('=')[1];
    const guardada = desdeCookie || localStorage.getItem('sfb_empresa');
    if (guardada) setEmpresa(guardada);
  }, []);

  function cambiarEmpresa(codigo: string) {
    setEmpresa(codigo);
    localStorage.setItem('sfb_empresa', codigo);
    document.cookie = `sfb_empresa=${codigo}; path=/; max-age=2592000; SameSite=Lax`;
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
        {rol && <span className="badge rol">{rol}</span>}
      </div>
    </header>
  );
}