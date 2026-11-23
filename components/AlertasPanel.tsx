'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AlertaComercial } from '@/lib/datos/alertasComercial';

type Vista =
  | { tipo: 'severidad'; valor: 'critico' | 'aviso' }
  | { tipo: 'categoria'; valor: AlertaComercial['categoria'] };

const CATEGORIAS: { clave: AlertaComercial['categoria']; etiqueta: string }[] = [
  { clave: 'clientes', etiqueta: 'Clientes' },
  { clave: 'cobros', etiqueta: 'Cobros' },
  { clave: 'pedidos', etiqueta: 'Pedidos' },
  { clave: 'agenda', etiqueta: 'Agenda' },
  { clave: 'objetivo', etiqueta: 'Objetivo' },
];

const TITULO: Record<AlertaComercial['categoria'], string> = {
  clientes: 'Clientes',
  cobros: 'Cobros',
  pedidos: 'Pedidos',
  agenda: 'Agenda',
  objetivo: 'Objetivo',
};

const PASO = 30;

export default function AlertasPanel({
  alertas,
  empresaId,
  comercialId,
}: {
  alertas: AlertaComercial[];
  empresaId: string;
  comercialId: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vista, setVista] = useState<Vista | null>(null);
  const [visibles, setVisibles] = useState(PASO);

  useEffect(() => {
    if (!vista) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVista(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [vista]);

  const criticas = alertas.filter((a) => a.severidad === 'critico').length;
  const avisos = alertas.filter((a) => a.severidad === 'aviso').length;
  const porCategoria = useMemo(() => {
    const m = new Map<AlertaComercial['categoria'], number>();
    for (const a of alertas) m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1);
    return m;
  }, [alertas]);

  const filas = useMemo(() => {
    if (!vista) return [];
    return vista.tipo === 'severidad'
      ? alertas.filter((a) => a.severidad === vista.valor)
      : alertas.filter((a) => a.categoria === vista.valor);
  }, [alertas, vista]);

  const tituloVista = !vista
    ? ''
    : vista.tipo === 'severidad'
      ? vista.valor === 'critico'
        ? 'Alertas críticas'
        : 'Avisos'
      : TITULO[vista.valor];

  async function silenciar(clave: string) {
    if (!comercialId) return;
    if (!window.confirm('¿Ocultar esta alerta? No volverá a aparecer para ti.')) return;
    startTransition(async () => {
      await supabase.from('alertas_silenciadas').insert({
        empresa_id: empresaId,
        comercial_id: comercialId,
        clave,
      });
      setVista(null);
      router.refresh();
    });
  }

  const tarjeta = (etiqueta: string, valor: number, nota: string, color: string | undefined, v: Vista) => (
    <li
      className="kpi kpi-clic"
      onClick={() => {
        setVisibles(PASO);
        setVista(v);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setVisibles(PASO);
          setVista(v);
        }
      }}
    >
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor" style={color ? { color } : undefined}>{valor}</strong>
      <span className="kpi-nota">{nota}</span>
      <span className="kpi-ver">Ver alertas →</span>
    </li>
  );

  return (
    <>
      <ul className="grid-kpis">
        {tarjeta('Críticas', criticas, 'requieren acción ya', 'var(--rojo)', { tipo: 'severidad', valor: 'critico' })}
        {tarjeta('Avisos', avisos, 'para revisar esta semana', 'var(--ambar)', { tipo: 'severidad', valor: 'aviso' })}
        {CATEGORIAS.map((c) =>
          tarjeta(c.etiqueta, porCategoria.get(c.clave) ?? 0, 'en esta categoría', undefined, {
            tipo: 'categoria',
            valor: c.clave,
          }),
        )}
      </ul>

      {vista ? (
        <div className="modal-fondo" onClick={() => setVista(null)} role="dialog" aria-modal="true">
          <div className="modal-caja modal-ancho" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{tituloVista}</h3>
                <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
                  {filas.length} {filas.length === 1 ? 'alerta' : 'alertas'}
                </p>
              </div>
              <button type="button" className="modal-cerrar" onClick={() => setVista(null)} aria-label="Cerrar">✕</button>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 12, maxHeight: '62vh' }}>
              {filas.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>Sin alertas en esta categoría.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {filas.slice(0, visibles).map((a, i) => (
                    <li
                      key={`${a.clave}-${i}`}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                        padding: '10px 0',
                        borderBottom: '1px solid var(--border-2)',
                      }}
                    >
                      <span className={`badge ${a.severidad === 'critico' ? 'construccion' : 'pendiente'}`} style={{ flexShrink: 0 }}>
                        {a.severidad === 'critico' ? 'Crítica' : 'Aviso'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{a.titulo}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 13 }}>{a.detalle}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                        <Link href={a.enlace} className="enlace">Abrir</Link>
                        <button type="button" className="boton" onClick={() => silenciar(a.clave)} disabled={pending}>
                          Silenciar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {visibles < filas.length ? (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button type="button" className="boton" onClick={() => setVisibles((v) => v + PASO)}>
                  Ver más ({filas.length - visibles} restantes)
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
