'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { METRICAS, FORMATOS } from '@/lib/datos/kpisCatalogo';

type Props = {
  id: string;
  nombre: string;
  metrica: string;
  calculo: string;
  objetivo: number | null;
  objetivo_op: string;
  formato: string;
  fmt: string;
  estaBueno: boolean | null;
  empresa: string;
};

export default function KpiCard({ id, nombre, metrica, calculo, objetivo, objetivo_op, formato, fmt, estaBueno, empresa }: Props) {
  const router = useRouter();
  const [borrando, setBorrando] = useState(false);

  async function borrar() {
    if (!confirm(`¿Eliminar el KPI "${nombre}"? Esta acción no se puede deshacer.`)) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/kpis?id=${encodeURIComponent(id)}&empresa=${encodeURIComponent(empresa)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'No se pudo eliminar.'); return; }
      router.refresh();
    } catch {
      alert('Error de conexión.');
    } finally {
      setBorrando(false);
    }
  }

  return (
    <li className="kpi" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={borrar}
        disabled={borrando}
        aria-label={`Eliminar ${nombre}`}
        title="Eliminar KPI"
        style={{
          position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--tenue)',
          opacity: borrando ? 0.4 : 0.6, fontSize: 14, fontWeight: 700, padding: 2,
        }}
      >
        {borrando ? '…' : '✕'}
      </button>
      <span className="kpi-etiqueta">
        {nombre}
        <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: 'var(--tenue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2, paddingRight: 14 }}>
          {METRICAS[metrica as keyof typeof METRICAS]?.etiqueta ?? metrica} · {calculo}
        </span>
      </span>
      <strong className="kpi-valor" style={{ color: estaBueno === null ? undefined : estaBueno ? 'var(--verde)' : 'var(--rojo)' }}>
        {fmt}
      </strong>
      <span className="kpi-nota">
        {objetivo != null
          ? `${objetivo_op === 'gte' ? 'Objetivo ≥' : 'Objetivo ≤'} ${FORMATOS[formato as keyof typeof FORMATOS]?.fmt(objetivo) ?? objetivo}`
          : 'Sin objetivo'}
      </span>
    </li>
  );
}