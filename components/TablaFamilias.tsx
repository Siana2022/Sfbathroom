'use client';
import { Fragment, useState } from 'react';
import { decimal, eur } from '@/lib/formato';
import type { MargenFamilia } from '@/lib/datos/margen';

/** Tabla de margen por familia con desglose del top 10 de clientes al pinchar. */
export default function TablaFamilias({ familias }: { familias: MargenFamilia[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Familia</th>
          <th className="td-num" title="Importe vendido neto (base imponible).">Importe vendido</th>
          <th className="td-num" title="Coste de la mercancía vendida.">Coste</th>
          <th className="td-num" title="Importe vendido menos coste.">Margen</th>
          <th className="td-num" title="Margen sobre el importe vendido.">Margen %</th>
        </tr>
      </thead>
      <tbody>
        {familias.map((f) => {
          const expandida = abierta === f.familia;
          return (
            <Fragment key={f.familia}>
              <tr
                className="fila-clic"
                onClick={() => setAbierta(expandida ? null : f.familia)}
                aria-expanded={expandida}
              >
                <td>
                  <span className="caret">{expandida ? '▾' : '▸'}</span> <span title={`Familia ${f.familia}. Pincha para ver el top 10 de clientes.`}>{f.familia}</span>
                </td>
                <td className="td-num">{eur(f.importe)}</td>
                <td className="td-num">{eur(f.coste)}</td>
                <td className="td-num">{eur(f.margen)}</td>
                <td className={`td-num ${f.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(f.margenPct)} %</td>
              </tr>
              {expandida && (
                <tr>
                  <td colSpan={5} style={{ background: 'var(--bg)', padding: '10px 14px' }}>
                    <strong style={{ fontSize: 13 }}>Top 10 clientes · {f.familia}</strong>
                    {f.clientes.length === 0 ? (
                      <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>Sin ventas de esta familia.</p>
                    ) : (
                      <table className="tabla" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th className="td-num" title="Importe vendido neto (base imponible).">Importe vendido</th>
                            <th className="td-num" title="Coste de la mercancía vendida.">Coste</th>
                            <th className="td-num" title="Importe vendido menos coste.">Margen</th>
                            <th className="td-num" title="Margen sobre el importe vendido.">Margen %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.clientes.map((c) => (
                            <tr key={c.nombre}>
                              <td title={c.nombre}>{c.nombre}</td>
                              <td className="td-num">{eur(c.importe)}</td>
                              <td className="td-num">{eur(c.coste)}</td>
                              <td className="td-num">{eur(c.margen)}</td>
                              <td className={`td-num ${c.margenPct >= 0 ? 'td-pos' : ''}`}>{decimal(c.margenPct)} %</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
