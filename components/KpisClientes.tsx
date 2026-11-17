'use client';
import { useEffect, useState } from 'react';
import { decimal, eur, numero } from '@/lib/formato';
import type { ClienteActividad, ListasClientes } from '@/lib/datos/clientes';

type Clave = keyof ListasClientes;

const TITULOS: Record<Clave, string> = {
  activos12m: 'Clientes con facturación en los últimos 12 meses',
  nuevos: 'Clientes nuevos',
  recuperados: 'Clientes recuperados',
  inactivos: 'Clientes inactivos (12-24 meses sin facturar)',
  perdidos: 'Clientes perdidos (más de 24 meses sin facturar)',
};

type Props = {
  anio: number;
  activos12m: number;
  retencion: number | null;
  nuevos: number;
  recuperados: number;
  inactivos: number;
  perdidos: number;
  listas: ListasClientes;
};

function fecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES');
}

function Tarjeta({
  etiqueta,
  valor,
  nota,
  onClick,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  onClick?: () => void;
}) {
  return (
    <li className={`kpi${onClick ? ' kpi-clic' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}>
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor">{valor}</strong>
      <span className="kpi-nota">{nota}</span>
      {onClick ? <span className="kpi-ver">Ver clientes →</span> : null}
    </li>
  );
}

export default function KpisClientes({ anio, activos12m, retencion, nuevos, recuperados, inactivos, perdidos, listas }: Props) {
  const [sel, setSel] = useState<Clave | null>(null);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel]);

  const filas: ClienteActividad[] = sel ? listas[sel] : [];

  return (
    <>
      <ul className="grid-kpis">
        <Tarjeta
          etiqueta="Clientes activos 12M"
          valor={numero(activos12m)}
          nota="con facturación en los últimos 12 meses"
          onClick={() => setSel('activos12m')}
        />
        <Tarjeta
          etiqueta="Tasa de retención"
          valor={retencion === null ? '—' : `${decimal(retencion)} %`}
          nota="siguen facturando año a año"
        />
        <Tarjeta etiqueta="Nuevos clientes" valor={numero(nuevos)} nota={`primera factura en ${anio}`} onClick={() => setSel('nuevos')} />
        <Tarjeta etiqueta="Recuperados" valor={numero(recuperados)} nota="vuelven tras un año sin comprar" onClick={() => setSel('recuperados')} />
        <Tarjeta etiqueta="Clientes inactivos" valor={numero(inactivos)} nota="entre 12 y 24 meses sin facturar" onClick={() => setSel('inactivos')} />
        <Tarjeta etiqueta="Clientes perdidos" valor={numero(perdidos)} nota="más de 24 meses sin facturar" onClick={() => setSel('perdidos')} />
      </ul>

      {sel ? (
        <div className="modal-fondo" onClick={() => setSel(null)} role="dialog" aria-modal="true">
          <div className="modal-caja modal-ancho" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{TITULOS[sel]}</h3>
                <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
                  {filas.length} {filas.length === 1 ? 'cliente' : 'clientes'} · datos de {anio}
                </p>
              </div>
              <button type="button" className="modal-cerrar" onClick={() => setSel(null)} aria-label="Cerrar">✕</button>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 14, maxHeight: '60vh' }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="td-num">Facturación {anio}</th>
                    <th className="td-num">Facturación {anio - 1}</th>
                    <th className="td-num">Últimos 12M</th>
                    <th className="td-num">Facturas</th>
                    <th>Primera</th>
                    <th>Última</th>
                    <th className="td-num">Días sin facturar</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td className="td-num">{eur(c.netaAnio)}</td>
                      <td className="td-num">{eur(c.netaPrev)}</td>
                      <td className="td-num">{eur(c.neta12m)}</td>
                      <td className="td-num">{numero(c.facturasAnio)}</td>
                      <td>{fecha(c.primera)}</td>
                      <td>{fecha(c.ultima)}</td>
                      <td className="td-num">{c.diasSin === null ? '—' : numero(c.diasSin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Sin clientes en esta categoría.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
