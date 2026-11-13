'use client';
import { useEffect, useMemo, useState } from 'react';
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
    facturacion: fila.facturacionMeses[i] ?? 0,
    facturado: fila.facturadoMeses[i] ?? 0,
    coste: fila.costeMeses[i] ?? 0,
  })).filter((r) => Math.abs(r.facturacion) > 0.005 || Math.abs(r.facturado) > 0.005 || Math.abs(r.coste) > 0.005);

  return (
    <div className="modal-fondo" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-caja" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{fila.cliente}</h3>
            <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
              Transporte terrestre por mes · {anio} · {fila.facturaTransporte ? 'se factura transporte' : 'no se factura transporte'}
            </p>
            <p style={{ color: 'var(--muted)', margin: '2px 0 0', fontSize: 13 }}>
              Facturación: {eur(fila.facturacion)} · Margen transporte s/ facturación:{' '}
              <strong style={fila.pctSobreFacturacion != null && fila.pctSobreFacturacion < 0 ? { color: '#c0392b' } : undefined}>
                {fila.pctSobreFacturacion === null ? '—' : `${decimal(fila.pctSobreFacturacion)} %`}
              </strong>
            </p>
          </div>
          <button type="button" className="modal-cerrar" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="td-num">Facturación</th>
                <th className="td-num">Facturado</th>
                <th className="td-num">Coste</th>
                <th className="td-num" title="Coste del transporte sobre la facturación sin el transporte facturado.">Margen %</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((r) => {
                const base = r.facturacion - r.facturado;
                const pct = Math.abs(base) > 0.005 ? (r.coste / base) * 100 : null;
                return (
                  <tr key={r.mes}>
                    <td>{r.mes}</td>
                    <td className="td-num">{r.facturacion === 0 ? '' : eur(r.facturacion)}</td>
                    <td className="td-num">{r.facturado === 0 ? '' : eur(r.facturado)}</td>
                    <td className="td-num">{r.coste === 0 ? '' : eur(r.coste)}</td>
                    <td className="td-num">{pct === null ? '—' : `${decimal(pct)} %`}</td>
                  </tr>
                );
              })}
              <tr>
                <td><strong>Total</strong></td>
                <td className="td-num"><strong>{eur(fila.facturacion)}</strong></td>
                <td className="td-num"><strong>{eur(fila.facturado)}</strong></td>
                <td className="td-num"><strong>{eur(fila.coste)}</strong></td>
                <td className="td-num"><strong>{fila.margenPct === null ? '—' : `${decimal(fila.margenPct)} %`}</strong></td>
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
  const [busqueda, setBusqueda] = useState('');

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    return q ? datos.filas.filter((f) => f.cliente.toLocaleLowerCase('es').includes(q)) : datos.filas;
  }, [busqueda, datos.filas]);

  if (datos.filas.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>Sin líneas de transporte terrestre en {datos.anio}.</p>;
  }

  return (
    <>
      <p style={{ margin: '6px 0 12px', fontSize: 14 }}>
        Coste del transporte sobre la facturación sin transporte:{' '}
        <strong>{datos.totales.margenPct === null ? '—' : `${decimal(datos.totales.margenPct)} %`}</strong>{' '}
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          ({eur(datos.totales.coste)} de coste sobre {eur(datos.totales.facturacionEmpresa - datos.totales.facturado)} facturados)
        </span>
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '8px 0', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          Buscar cliente
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre del cliente"
            style={{ minWidth: 220, padding: '7px 10px', border: '1px solid var(--border-2)', borderRadius: 8 }}
          />
        </label>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Pincha un cliente para ver su detalle mensual.</span>
        <DescargarExcel
          nombre={`rentabilidad-transporte-${datos.anio}`}
          columnas={['Cliente', 'Factura transporte', 'Facturación', 'Facturado', 'Coste', 'Margen %']}
          registros={filtradas.map((f) => [f.cliente, f.facturaTransporte ? 'Sí' : 'No', f.facturacion, f.facturado, f.coste, f.margenPct ?? ''])}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Factura transporte</th>
              <th className="td-num">Facturación</th>
              <th className="td-num">Facturado</th>
              <th className="td-num">Coste</th>
              <th className="td-num" title="Coste del transporte sobre la facturación sin el transporte facturado.">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => (
              <tr key={f.cliente} className="fila-clic" onClick={() => setSel(f)}>
                <td>{f.cliente}</td>
                <td>{f.facturaTransporte ? 'Sí' : 'No'}</td>
                <td className="td-num">{eur(f.facturacion)}</td>
                <td className="td-num">{eur(f.facturado)}</td>
                <td className="td-num">{eur(f.coste)}</td>
                <td className="td-num">{f.margenPct === null ? '—' : `${decimal(f.margenPct)} %`}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td></td>
              <td className="td-num"><strong>{eur(datos.totales.facturacionEmpresa)}</strong></td>
              <td className="td-num"><strong>{eur(datos.totales.facturado)}</strong></td>
              <td className="td-num"><strong>{eur(datos.totales.coste)}</strong></td>
              <td className="td-num"><strong>{datos.totales.margenPct === null ? '—' : `${decimal(datos.totales.margenPct)} %`}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {sel ? <ModalCliente fila={sel} anio={datos.anio} onClose={() => setSel(null)} /> : null}
    </>
  );
}
