'use client';
import { useMemo, useState } from 'react';
import { decimal, eur } from '@/lib/formato';
import DescargarExcel from '@/components/DescargarExcel';
import type { ClienteCredito } from '@/lib/datos/cobros';

const PASO = 25;

export default function TablaCreditosClientes({ filas }: { filas: ClienteCredito[] }) {
  const [visibles, setVisibles] = useState(PASO);
  const mostradas = useMemo(() => filas.slice(0, visibles), [filas, visibles]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Crédito y cobro por cliente</h2>
        <DescargarExcel
          nombre="credito-cobro-por-cliente"
          columnas={['Cliente', 'Saldo', 'Vencido', 'Riesgo vivo', 'Límite', '% límite', 'DSO', 'Δ DSO 30 días']}
          registros={filas.map((c) => [
            c.nombre,
            c.saldo,
            c.vencido,
            c.riesgoVivo,
            c.limite ?? '',
            c.consumoLimitePct === null ? '' : c.consumoLimitePct.toFixed(2),
            c.dso === null ? '' : c.dso.toFixed(2),
            c.dsoDelta === null ? '' : c.dsoDelta.toFixed(2),
          ])}
        />
      </div>

      {filas.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Sin saldos pendientes.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="td-num">Saldo</th>
                  <th className="td-num">Mora en pago</th>
                  <th className="td-num">Riesgo vivo</th>
                  <th className="td-num">Límite</th>
                  <th className="td-num">% límite</th>
                  <th className="td-num">Media de cobros</th>
                  <th className="td-num">Vs hace 30 días</th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td className="td-num">{eur(c.saldo)}</td>
                    <td className={`td-num ${c.vencido > 0 ? 'td-pos' : ''}`}>{eur(c.vencido)}</td>
                    <td className="td-num">{eur(c.riesgoVivo)}</td>
                    <td className="td-num">{c.limite ? eur(c.limite) : '—'}</td>
                    <td className={`td-num ${c.consumoLimitePct !== null && c.consumoLimitePct > 90 ? 'td-pos' : ''}`}>
                      {c.consumoLimitePct === null ? '—' : `${decimal(c.consumoLimitePct)} %`}
                    </td>
                    <td className="td-num">{c.dso === null ? '—' : `${decimal(c.dso)} días`}</td>
                    <td className="td-num">
                      {c.dso === null || c.dsoDelta === null ? '—' : `${c.dsoDelta > 0 ? '+' : ''}${decimal(c.dsoDelta)} días`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              Mostrando {mostradas.length} de {filas.length} clientes
            </span>
            {visibles < filas.length ? (
              <button type="button" className="boton" onClick={() => setVisibles((v) => v + PASO)}>
                Ver más
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
