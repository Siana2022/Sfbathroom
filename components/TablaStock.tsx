'use client';
import { Fragment, useState } from 'react';
import { eur, eur2, numero } from '@/lib/formato';
import type { GrupoStock } from '@/lib/datos/stockAlmacen';

/** Existencias agrupadas por artículo; al pinchar se abren sus modelos, almacenes y lotes. */
export default function TablaStock({ grupos }: { grupos: GrupoStock[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);

  if (grupos.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>No hay existencias que cumplan el filtro.</p>;
  }

  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Artículo</th>
          <th className="td-num" title="Unidades en stock sumando todos los almacenes y lotes.">Unidades</th>
          <th className="td-num" title="Valor a coste real de compra (precio x cambio del lote).">Valor</th>
          <th className="td-num" title="Unidades pedidas a proveedor pendientes de recibir (stock en mar).">Stock en mar</th>
        </tr>
      </thead>
      <tbody>
        {grupos.map((g) => {
          const expandido = abierto === g.clave;
          return (
            <Fragment key={g.clave}>
              <tr className="fila-clic" onClick={() => setAbierto(expandido ? null : g.clave)} aria-expanded={expandido}>
                <td>
                  <span className="caret">{expandido ? '▾' : '▸'}</span> {g.nombre}
                </td>
                <td className="td-num">{numero(g.unidades)}</td>
                <td className="td-num">{eur2(g.valor)}</td>
                <td className="td-num">{g.enMar > 0 ? numero(g.enMar) : '—'}</td>
              </tr>
              {expandido && (
                <tr>
                  <td colSpan={4} style={{ background: 'var(--bg)', padding: '10px 14px' }}>
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Almacén</th>
                          <th>Lote</th>
                          <th className="td-num">Stock</th>
                          <th className="td-num" title="Unidades pedidas a proveedor pendientes de recibir para este artículo.">Stock en mar</th>
                          <th className="td-num" title="Precio de compra del lote por el cambio de la factura; si no hay, el último del artículo.">Coste</th>
                          <th className="td-num">Valor</th>
                          <th>Ubicación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.filas.map((f, i) => (
                          <tr key={`${f.articulo_codigo}|${f.almacen_codigo}|${f.lote}`}>
                            <td>{f.articulo_codigo}</td>
                            <td>{f.almacen_codigo}{f.almacen_nombre ? ` · ${f.almacen_nombre}` : ''}</td>
                            <td>{f.lote || '—'}</td>
                            <td className="td-num">{numero(f.unidades)}</td>
                            <td className="td-num">
                              {f.enMar > 0 && g.filas.findIndex((x) => x.articulo_codigo === f.articulo_codigo) === i
                                ? numero(f.enMar)
                                : '—'}
                            </td>
                            <td className="td-num">{f.coste === null ? '—' : eur2(f.coste)}</td>
                            <td className="td-num">{eur2(f.unidades * Number(f.coste ?? 0))}</td>
                            <td>{f.ubicacion || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
