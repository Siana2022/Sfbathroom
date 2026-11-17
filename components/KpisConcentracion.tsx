'use client';
import { useEffect, useState } from 'react';
import { decimal, eur } from '@/lib/formato';

type Cliente = { nombre: string; neta: number; pct: number; acumulado: number };

type Props = {
  netaTotal: number;
  numClientes: number;
  top1: number | null;
  top3: number | null;
  top10: number | null;
  hhi: number;
  pareto: Cliente[];
};

type Vista = 'todos' | 'top1' | 'top3' | 'top10' | 'hhi';

const TITULO: Record<Vista, string> = {
  todos: 'Clientes con venta',
  top1: 'Mayor cliente',
  top3: 'Tres mayores clientes',
  top10: 'Diez mayores clientes',
  hhi: 'Índice de Herfindahl (HHI)',
};

export default function KpisConcentracion({ netaTotal, numClientes, top1, top3, top10, hhi, pareto }: Props) {
  const [vista, setVista] = useState<Vista | null>(null);

  useEffect(() => {
    if (!vista) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVista(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [vista]);

  const filas = !vista
    ? []
    : vista === 'top1'
      ? pareto.slice(0, 1)
      : vista === 'top3'
        ? pareto.slice(0, 3)
        : vista === 'top10' || vista === 'hhi'
          ? pareto.slice(0, 10)
          : pareto.slice(0, 500);

  const tarjeta = (etiqueta: string, valor: string, nota: string, v?: Vista) => (
    <li
      className={`kpi${v ? ' kpi-clic' : ''}`}
      onClick={v ? () => setVista(v) : undefined}
      role={v ? 'button' : undefined}
      tabIndex={v ? 0 : undefined}
      onKeyDown={v ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVista(v); } } : undefined}
    >
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor">{valor}</strong>
      <span className="kpi-nota">{nota}</span>
      {v ? <span className="kpi-ver">Ver clientes →</span> : null}
    </li>
  );

  return (
    <>
      <ul className="grid-kpis">
        {tarjeta('Facturación total', eur(netaTotal), `${numClientes} clientes con venta`, 'todos')}
        {tarjeta('% top 1', top1 === null ? '—' : `${decimal(top1)} %`, 'mayor cliente sobre el total', 'top1')}
        {tarjeta('% top 3', top3 === null ? '—' : `${decimal(top3)} %`, 'tres mayores clientes', 'top3')}
        {tarjeta('% top 10', top10 === null ? '—' : `${decimal(top10)} %`, 'diez mayores clientes', 'top10')}
        {tarjeta('Índice de Herfindahl', decimal(hhi), '×10.000 (mayor = más concentrado)', 'hhi')}
      </ul>

      {vista ? (
        <div className="modal-fondo" onClick={() => setVista(null)} role="dialog" aria-modal="true">
          <div className="modal-caja modal-ancho" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{TITULO[vista]}</h3>
                {vista === 'hhi' ? (
                  <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 13, maxWidth: 720 }}>
                    El HHI suma los cuadrados de la cuota de cada cliente. Menos de 1.500 = cartera
                    diversificada; 1.500-2.500 = concentración moderada; más de 2.500 = muy concentrada.
                    La tabla muestra los 10 mayores y su aportación al índice.
                  </p>
                ) : (
                  <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
                    {filas.length} {filas.length === 1 ? 'cliente' : 'clientes'}
                  </p>
                )}
              </div>
              <button type="button" className="modal-cerrar" onClick={() => setVista(null)} aria-label="Cerrar">✕</button>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 14, maxHeight: '60vh' }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="td-num">Facturación</th>
                    <th className="td-num">% sobre total</th>
                    <th className="td-num">% acumulado</th>
                    {vista === 'hhi' ? <th className="td-num">Aporte al HHI</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((c) => (
                    <tr key={c.nombre}>
                      <td>{c.nombre}</td>
                      <td className="td-num">{eur(c.neta)}</td>
                      <td className="td-num">{decimal(c.pct)} %</td>
                      <td className="td-num">{decimal(c.acumulado)} %</td>
                      {vista === 'hhi' ? <td className="td-num">{decimal(c.pct * c.pct)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
