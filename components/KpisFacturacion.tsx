'use client';
import { useState } from 'react';
import { eur, decimal, numero } from '@/lib/formato';
import GraficoLineas, { type PuntoLinea } from '@/components/GraficoLineas';
import type { SerieMensualKpi } from '@/lib/datos/facturacion';

export type KpiFact = { clave: string; etiqueta: string; valor: string; nota?: string };

const NOMBRE_MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatoDe(clave: string): (v: number) => string {
  if (clave === 'unidades') return numero;
  if (clave === 'desviacion' || clave === 'cumplimiento_proy') return (v: number) => `${decimal(v)} %`;
  return eur;
}

function lineasDe(clave: string, series: SerieMensualKpi[]): PuntoLinea[] {
  if (clave === 'ytd') {
    const hayPrev = series.some((s) => s.netaPrev != null);
    let aCur = 0;
    let aPrev = 0;
    return series.map((s) => {
      aCur += s.netaCur;
      aPrev += s.netaPrev ?? 0;
      return { etiqueta: NOMBRE_MES[s.mes], cur: aCur, prev: hayPrev ? aPrev : null };
    });
  }
  return series.map((s) => {
    const etiqueta = NOMBRE_MES[s.mes];
    switch (clave) {
      case 'neta':
        return { etiqueta, cur: s.netaCur, prev: s.netaPrev };
      case 'unidades':
        return { etiqueta, cur: s.unidadesCur, prev: s.unidadesPrev };
      case 'ticket':
        return {
          etiqueta,
          cur: s.facturasCur > 0 ? s.netaCur / s.facturasCur : null,
          prev: s.facturasPrev > 0 && s.netaPrev != null ? s.netaPrev / s.facturasPrev : null,
        };
      case 'precio':
        return {
          etiqueta,
          cur: s.unidadesCur > 0 ? s.netaCur / s.unidadesCur : null,
          prev: s.unidadesPrev > 0 && s.netaPrev != null ? s.netaPrev / s.unidadesPrev : null,
        };
      case 'desviacion':
        return { etiqueta, cur: s.presupuesto > 0 ? (s.netaCur / s.presupuesto) * 100 : null, prev: null };
      default:
        // proyeccion, cumplimiento_proy: sin serie histórica (se muestra vacío).
        return { etiqueta, cur: null, prev: null };
    }
  });
}

export default function KpisFacturacion({
  kpis,
  series,
  anio,
  anioPrevio,
}: {
  kpis: KpiFact[];
  series: SerieMensualKpi[];
  anio: number;
  anioPrevio: number;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const seleccionado = kpis.find((k) => k.clave === sel) ?? null;

  return (
    <>
      <div className="grid-kpis grid-kpis-4">
        {kpis.map((k) => (
          <button
            key={k.clave}
            type="button"
            className={`kpi kpi-boton${sel === k.clave ? ' activo' : ''}`}
            aria-expanded={sel === k.clave}
            onClick={() => setSel((prev) => (prev === k.clave ? null : k.clave))}
          >
            <span className="kpi-etiqueta">{k.etiqueta}</span>
            <strong className="kpi-valor">{k.valor}</strong>
            {k.nota ? <span className="kpi-nota">{k.nota}</span> : null}
            <span className="kpi-ver">{sel === k.clave ? 'ocultar ▴' : 'ver evolución ▾'}</span>
          </button>
        ))}
      </div>

      {seleccionado ? (
        <div className="card">
          <h2>Evolución mensual · {seleccionado.etiqueta}</h2>
          <GraficoLineas
            series={lineasDe(seleccionado.clave, series)}
            formato={formatoDe(seleccionado.clave)}
            leyenda={{ a: String(anio), b: String(anioPrevio) }}
          />
        </div>
      ) : null}
    </>
  );
}
