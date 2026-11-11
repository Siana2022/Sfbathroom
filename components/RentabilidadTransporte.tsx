'use client';
import { useEffect, useState } from 'react';
import { eur, decimal } from '@/lib/formato';
import DescargarExcel from '@/components/DescargarExcel';
import type { RentabilidadTransporteFila, RentabilidadTransporte as Datos } from '@/lib/datos/transporte';

const NOMBRE_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function ModalCliente({ fila, anio, onClose }: { fila: RentabilidadTransporteFila; anio: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meses = NOMBRE_MES.map((m, i) => ({
    mes: m,
    facturado: fila.facturadoMeses[i] ?? 0,
    coste: fila.costeMeses[i] ?? 0,
  })).filter((r) => Math.abs(r.facturado) > 0.005 || Math.abs(r.coste) > 0.005);

  return (
    <div className="modal-fondo" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-caja" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{fila.cliente}</h3>
            <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
              Transporte terrestre por mes · {anio} · {fila.facturaTransporte ? 'se factura transporte' : 'no se factura transporte'}
            </p>
          </div>
          <button type="button" className="modal-cerrar" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="td-num">Facturado</th>
                <th className="td-num">Coste</th>
                <th className="td-num">Margen</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((r) => {
                const margen = r.facturado - r.coste;
                return (
                  <tr key={r.mes}>
                    <td>{r.mes}</td>
                    <td className="td-num">{r.facturado === 0 ? '' : eur(r.facturado)}</td>
                    <td className="td-num">{r.coste === 0 ? '' : eur(r.coste)}</td>
                    <td className="td-num" style={margen < 0 ? { color: '#c0392b' } : undefined}>
                      {margen > 0 ? '+' : ''}{eur(margen)}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td><strong>Total</strong></td>
                <td className="td-num"><strong>{eur(fila.facturado)}</strong></td>
                <td className="td-num"><strong>{eur(fila.coste)}</strong></td>
                <td className="td-num"><strong style={fila.margen < 0 ? { color: '#c0392b' } : undefined}>{eur(fila.margen)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function RentabilidadTransporte({ datos }: { datos: Datos }) {
  const [sel, setSel] = useState<RentabilidadTransporteFila | null>(null);

  if (datos.filas.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>Sin líneas de transporte terrestre en {datos.anio}.</p>;
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Pincha un cliente para ver su detalle mensual.</span>
        <DescargarExcel
          nombre={`rentabilidad-transporte-${datos.anio}`}
          columnas={['Cliente', 'Factura transporte', 'Facturado', 'Coste', 'Margen', 'Margen %']}
          registros={datos.filas.map((f) => [f.cliente, f.facturaTransporte ? 'Sí' : 'No', f.facturado, f.coste, f.margen, f.margenPct ?? ''])}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Factura transporte</th>
              <th className="td-num">Facturado</th>
              <th className="td-num">Coste</th>
              <th className="td-num">Margen</th>
              <th className="td-num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f) => (
              <tr key={f.cliente} className="fila-clic" onClick={() => setSel(f)}>
                <td>{f.cliente}</td>
                <td>{f.facturaTransporte ? 'Sí' : 'No'}</td>
                <td className="td-num">{eur(f.facturado)}</td>
                <td className="td-num">{eur(f.coste)}</td>
                <td className="td-num" style={f.margen < 0 ? { color: '#c0392b' } : undefined}>
                  {f.margen > 0 ? '+' : ''}{eur(f.margen)}
                </td>
                <td className="td-num" style={f.margenPct != null && f.margenPct < 0 ? { color: '#c0392b' } : undefined}>
                  {f.margenPct === null ? '—' : `${decimal(f.margenPct)} %`}
                </td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td></td>
              <td className="td-num"><strong>{eur(datos.totales.facturado)}</strong></td>
              <td className="td-num"><strong>{eur(datos.totales.coste)}</strong></td>
              <td className="td-num"><strong style={datos.totales.margen < 0 ? { color: '#c0392b' } : undefined}>{eur(datos.totales.margen)}</strong></td>
              <td className="td-num"><strong>{datos.totales.margenPct === null ? '—' : `${decimal(datos.totales.margenPct)} %`}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {sel ? <ModalCliente fila={sel} anio={datos.anio} onClose={() => setSel(null)} /> : null}
    </>
  );
}
