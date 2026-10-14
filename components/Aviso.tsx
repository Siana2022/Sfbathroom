import type { ReactNode } from 'react';

type Tipo = 'demo' | 'info';

export default function Aviso({ tipo = 'info', children }: { tipo?: Tipo; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tipo}`}>
      {tipo === 'demo' && <span className="aviso-etiqueta">Datos demo</span>}
      <span>{children}</span>
    </div>
  );
}
