'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import type { AlertaComercial } from '@/lib/datos/alertasComercial';

const CATEGORIAS: { clave: AlertaComercial['categoria'] | 'todas'; etiqueta: string }[] = [
  { clave: 'todas', etiqueta: 'Todas' },
  { clave: 'clientes', etiqueta: 'Clientes' },
  { clave: 'cobros', etiqueta: 'Cobros' },
  { clave: 'pedidos', etiqueta: 'Pedidos' },
  { clave: 'agenda', etiqueta: 'Agenda' },
  { clave: 'objetivo', etiqueta: 'Objetivo' },
];

const ORDEN: AlertaComercial['categoria'][] = ['cobros', 'pedidos', 'clientes', 'agenda', 'objetivo'];

const TITULO: Record<AlertaComercial['categoria'], string> = {
  clientes: 'Clientes',
  cobros: 'Cobros',
  pedidos: 'Pedidos',
  agenda: 'Agenda',
  objetivo: 'Objetivo',
};

export default function AlertasLista({
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
  const [categoria, setCategoria] = useState<AlertaComercial['categoria'] | 'todas'>('todas');
  const [severidad, setSeveridad] = useState<'todas' | 'critico' | 'aviso'>('todas');

  const porCategoria = useMemo(() => {
    const m = new Map<AlertaComercial['categoria'], AlertaComercial[]>();
    for (const a of alertas) {
      if (severidad !== 'todas' && a.severidad !== severidad) continue;
      if (categoria !== 'todas' && a.categoria !== categoria) continue;
      const arr = m.get(a.categoria) ?? [];
      arr.push(a);
      m.set(a.categoria, arr);
    }
    return m;
  }, [alertas, categoria, severidad]);

  const total = [...porCategoria.values()].reduce((s, v) => s + v.length, 0);

  async function silenciar(clave: string) {
    if (!comercialId) return;
    if (!window.confirm('¿Ocultar esta alerta? No volverá a aparecer para ti.')) return;
    startTransition(async () => {
      await supabase.from('alertas_silenciadas').insert({
        empresa_id: empresaId,
        comercial_id: comercialId,
        clave,
      });
      router.refresh();
    });
  }

  const cuenta = (c: AlertaComercial['categoria'] | 'todas') =>
    c === 'todas' ? alertas.length : alertas.filter((a) => a.categoria === c).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {CATEGORIAS.map((c) => (
          <button
            key={c.clave}
            type="button"
            className="boton"
            onClick={() => setCategoria(c.clave)}
            style={categoria === c.clave ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          >
            {c.etiqueta} ({cuenta(c.clave)})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['todas', 'critico', 'aviso'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className="boton"
            onClick={() => setSeveridad(s)}
            style={severidad === s ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          >
            {s === 'todas' ? 'Todas' : s === 'critico' ? 'Críticas' : 'Avisos'}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Sin alertas con estos filtros.</p>
      ) : (
        ORDEN.map((cat) => {
          const filas = porCategoria.get(cat) ?? [];
          if (filas.length === 0) return null;
          return (
            <div key={cat} className="card">
              <h2 style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{TITULO[cat]}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>{filas.length}</span>
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {filas.map((a, i) => (
                  <li
                    key={`${a.tipo}-${i}`}
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
            </div>
          );
        })
      )}
    </div>
  );
}
