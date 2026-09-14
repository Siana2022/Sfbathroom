'use client';

import { useState, useEffect } from 'react';
import ResponsiveGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { eur, numero } from '@/lib/formato';

// los tipos empaquetados de react-grid-layout son incompletos; usar cast funcional
const Grilla = ResponsiveGridLayout as unknown as React.FC<any>;

const STORAGE_KEY = 'sfb-panel-layout';

type Tarjeta = { key: string; w: number; h: number; minW?: number; minH?: number; etiqueta: string; contenido: React.ReactNode };

function inicializacion(): Omit<Tarjeta, 'contenido'>[] {
  if (typeof window !== 'undefined') {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) return JSON.parse(guardado);
    } catch { /* ignore */ }
  }
  return [
    { key: 'neta', w: 3, h: 1, etiqueta: 'Facturación neta' },
    { key: 'clientes', w: 2, h: 1, etiqueta: 'Clientes activos' },
    { key: 'ticket', w: 2, h: 1, etiqueta: 'Ticket medio' },
    { key: 'resumen', w: 6, h: 2, etiqueta: 'Resumen del día' },
  ];
}

function TarjetaKpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="kpi" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor" style={{ fontSize: 20 }}>{valor}</strong>
    </div>
  );
}

export default function DragDashboard({ neta, clientes, ticket, resumen }: { neta: number; clientes: number; ticket: number; resumen: string | null }) {
  const [layout, setLayout] = useState(() => inicializacion());
  const contenidoMap: Record<string, React.ReactNode> = {
    neta: <TarjetaKpi etiqueta="Facturación neta 2026" valor={eur(neta)} />,
    clientes: <TarjetaKpi etiqueta="Clientes activos" valor={numero(clientes)} />,
    ticket: <TarjetaKpi etiqueta="Ticket medio" valor={eur(ticket)} />,
    resumen: resumen ? (
      <div>
        <strong style={{ display: 'block', marginBottom: 6 }}>Resumen de hoy</strong>
        <p style={{ fontFamily: 'var(--serif, serif)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{resumen}</p>
      </div>
    ) : (
      <span style={{ color: 'var(--muted)' }}>Sin resumen generado hoy.</span>
    ),
  };

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
  }, [layout]);

  const gridLayout = layout.map((t) => ({
    i: t.key,
    x: 0,
    y: Infinity,
    w: t.w,
    h: t.h,
    minW: t.minW ?? 2,
    minH: t.minH ?? 1,
    static: false,
  }));

  return (
    <Grilla
      className="layout-drag"
      layout={gridLayout}
      cols={6}
      rowHeight={80}
      width={900}
      isDraggable
      isResizable
      draggableHandle=".drag-handle"
      onLayoutChange={(newLayout: { i: string; w: number; h: number }[]) => {
        const nuevo = newLayout.map((l) => ({
          ...layout.find((t) => t.key === l.i) ?? { key: l.i, etiqueta: l.i },
          w: l.w,
          h: l.h,
        }));
        setLayout(nuevo);
      }}
    >
      {layout.map((t) => (
        <div key={t.key} className="panel-card">
          <div className="drag-handle panel-handle" title="Arrastrar para mover">⠿ <span style={{ fontWeight: 600, fontSize: 13 }}>{t.etiqueta}</span></div>
          <div style={{ padding: 12, flex: 1 }}>{contenidoMap[t.key] ?? <span style={{ color: 'var(--muted)' }}>Sin contenido</span>}</div>
        </div>
      ))}
    </Grilla>
  );
}