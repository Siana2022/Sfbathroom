'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { bloqueVacio, renderizarEmail, type BloqueEmail } from '@/lib/marketing/bloques';

const TIPOS: { tipo: BloqueEmail['tipo']; etiqueta: string }[] = [
  { tipo: 'titulo', etiqueta: 'Título' },
  { tipo: 'texto', etiqueta: 'Texto' },
  { tipo: 'imagen', etiqueta: 'Imagen' },
  { tipo: 'boton', etiqueta: 'Botón' },
  { tipo: 'separador', etiqueta: 'Separador' },
];

export default function EditorEmail({
  campanaId,
  nombreInicial,
  asuntoInicial,
  bloquesIniciales,
}: {
  campanaId: string;
  nombreInicial: string;
  asuntoInicial: string;
  bloquesIniciales: BloqueEmail[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nombre, setNombre] = useState(nombreInicial);
  const [asunto, setAsunto] = useState(asuntoInicial);
  const [bloques, setBloques] = useState<BloqueEmail[]>(bloquesIniciales);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [estado, setEstado] = useState<string | null>(null);

  const html = useMemo(() => renderizarEmail(bloques, 'https://sfbathroom.com/baja'), [bloques]);

  function cambiar(i: number, cambios: Partial<BloqueEmail>) {
    setBloques((prev) => prev.map((b, j) => (j === i ? ({ ...b, ...cambios } as BloqueEmail) : b)));
  }

  function mover(i: number, delta: number) {
    setBloques((prev) => {
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function soltar(destino: number) {
    if (arrastrando === null || arrastrando === destino) return;
    setBloques((prev) => {
      const copia = [...prev];
      const [movido] = copia.splice(arrastrando, 1);
      copia.splice(destino, 0, movido);
      return copia;
    });
    setArrastrando(null);
  }

  function guardar() {
    startTransition(async () => {
      const { error } = await supabase
        .from('campanas_email')
        .update({ nombre, asunto, bloques })
        .eq('id', campanaId);
      setEstado(error ? error.message : 'Campaña guardada.');
      if (!error) router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
      <div>
        <div className="card">
          <label className="campo-filtro" style={{ display: 'block', marginBottom: 10 }}>
            Nombre de la campaña
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="campo-filtro" style={{ display: 'block' }}>
            Asunto
            <input type="text" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Novedades de sfbathroom" />
          </label>
        </div>

        <div className="card">
          <h2>Bloques</h2>
          {bloques.length === 0 ? <p style={{ color: 'var(--muted)' }}>Añade el primer bloque abajo.</p> : null}
          {bloques.map((b, i) => (
            <div
              key={i}
              draggable
              onDragStart={() => setArrastrando(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltar(i)}
              style={{
                border: '1px solid var(--border-2)',
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
                background: arrastrando === i ? 'var(--wash)' : '#fff',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ cursor: 'grab', color: 'var(--muted)' }}>⠿</span>
                <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }}>{b.tipo}</strong>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button type="button" className="boton" onClick={() => mover(i, -1)}>↑</button>
                  <button type="button" className="boton" onClick={() => mover(i, 1)}>↓</button>
                  <button type="button" className="boton" onClick={() => setBloques(bloques.filter((_, j) => j !== i))}>✕</button>
                </span>
              </div>

              {b.tipo === 'titulo' || b.tipo === 'texto' ? (
                b.tipo === 'texto' ? (
                  <textarea value={b.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} rows={3} style={{ width: '100%' }} />
                ) : (
                  <input type="text" value={b.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} style={{ width: '100%' }} />
                )
              ) : null}

              {b.tipo === 'imagen' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="url" placeholder="URL de la imagen" value={b.url} onChange={(e) => cambiar(i, { url: e.target.value })} style={{ flex: 1, minWidth: 220 }} />
                  <input type="url" placeholder="Enlace (opcional)" value={b.enlace ?? ''} onChange={(e) => cambiar(i, { enlace: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
                </div>
              ) : null}

              {b.tipo === 'boton' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Texto" value={b.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
                  <input type="url" placeholder="https://…" value={b.url} onChange={(e) => cambiar(i, { url: e.target.value })} style={{ flex: 2, minWidth: 220 }} />
                </div>
              ) : null}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {TIPOS.map((t) => (
              <button key={t.tipo} type="button" className="boton" onClick={() => setBloques([...bloques, bloqueVacio(t.tipo)])}>
                + {t.etiqueta}
              </button>
            ))}
          </div>

          {estado ? <p className="nota">{estado}</p> : null}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={guardar} disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar campaña'}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ position: 'sticky', top: 16 }}>
        <h2>Vista previa</h2>
        <iframe title="Vista previa" srcDoc={html} style={{ width: '100%', height: 520, border: '1px solid var(--border-2)', borderRadius: 8 }} />
      </div>
    </div>
  );
}
