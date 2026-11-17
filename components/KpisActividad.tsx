'use client';
import { useEffect, useState } from 'react';
import { decimal, eur, numero } from '@/lib/formato';

type Comercial = { nombre: string; neta: number; presupuesto: number; cumplimientoPct: number | null };
type Lista = { cliente: string; comercial: string };

type Props = {
  anio: number;
  totalNeta: number;
  numComerciales: number;
  totalPresupuesto: number;
  nuevos: number;
  perdidos: number;
  comerciales: Comercial[];
  listas: { nuevos: Lista[]; perdidos: Lista[] };
};

type Vista = 'facturacion' | 'cumplimiento' | 'nuevos' | 'perdidos';

const TITULOS: Record<Vista, string> = {
  facturacion: 'Facturación gestionada por comercial',
  cumplimiento: 'Cumplimiento de presupuesto por comercial',
  nuevos: 'Clientes nuevos',
  perdidos: 'Clientes perdidos',
};

export default function KpisActividad({
  anio,
  totalNeta,
  numComerciales,
  totalPresupuesto,
  nuevos,
  perdidos,
  comerciales,
  listas,
}: Props) {
  const [vista, setVista] = useState<Vista | null>(null);

  useEffect(() => {
    if (!vista) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVista(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [vista]);

  const tarjeta = (etiqueta: string, valor: string, nota: string, v: Vista) => (
    <li className="kpi kpi-clic" onClick={() => setVista(v)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVista(v); } }}>
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor">{valor}</strong>
      <span className="kpi-nota">{nota}</span>
      <span className="kpi-ver">Ver detalle →</span>
    </li>
  );

  const filasComercial = comerciales;
  const filasClientes = vista === 'nuevos' ? listas.nuevos : vista === 'perdidos' ? listas.perdidos : [];

  return (
    <>
      <ul className="grid-kpis">
        {tarjeta(`Facturación gestionada ${anio}`, numero(totalNeta), `${numComerciales} comerciales activos`, 'facturacion')}
        {tarjeta(
          'Cumplimiento presupuesto',
          totalPresupuesto > 0 ? `${decimal((totalNeta / totalPresupuesto) * 100)} %` : '—',
          `presupuesto ${numero(totalPresupuesto)} €`,
          'cumplimiento',
        )}
        {tarjeta('Clientes nuevos', numero(nuevos), 'incorporados este ejercicio', 'nuevos')}
        {tarjeta('Clientes perdidos', numero(perdidos), 'respecto al ejercicio anterior', 'perdidos')}
      </ul>

      {vista ? (
        <div className="modal-fondo" onClick={() => setVista(null)} role="dialog" aria-modal="true">
          <div className="modal-caja modal-ancho" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{TITULOS[vista]}</h3>
                <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
                  {vista === 'nuevos' || vista === 'perdidos'
                    ? `${filasClientes.length} ${filasClientes.length === 1 ? 'cliente' : 'clientes'}`
                    : `${filasComercial.length} comerciales`}
                </p>
              </div>
              <button type="button" className="modal-cerrar" onClick={() => setVista(null)} aria-label="Cerrar">✕</button>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 14, maxHeight: '60vh' }}>
              {vista === 'nuevos' || vista === 'perdidos' ? (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Comercial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasClientes.map((c, i) => (
                      <tr key={`${c.cliente}-${c.comercial}-${i}`}>
                        <td>{c.cliente}</td>
                        <td>{c.comercial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Comercial</th>
                      <th className="td-num">Facturación</th>
                      {vista === 'cumplimiento' ? (
                        <>
                          <th className="td-num">Presupuesto</th>
                          <th className="td-num">Cumplimiento %</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filasComercial.map((c) => (
                      <tr key={c.nombre}>
                        <td>{c.nombre}</td>
                        <td className="td-num">{eur(c.neta)}</td>
                        {vista === 'cumplimiento' ? (
                          <>
                            <td className="td-num">{c.presupuesto > 0 ? eur(c.presupuesto) : '—'}</td>
                            <td className="td-num">{c.cumplimientoPct === null ? '—' : `${decimal(c.cumplimientoPct)} %`}</td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
