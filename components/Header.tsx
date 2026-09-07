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
    const guardada = localStorage.getItem('sfb_empresa');
    if (guardada) setEmpresa(guardada);
  }, []);

  function cambiarEmpresa(codigo: string) {
    setEmpresa(codigo);
    localStorage.setItem('sfb_empresa', codigo);
  }

  return (
    <header className="topbar">
      <span className="breadcrumb">sfbathroom · BI</span>
      <div className="topbar-derecha">
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