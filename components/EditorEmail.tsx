'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { bloqueVacio, renderizarEmail, type BloqueEmail } from '@/lib/marketing/bloques';

const TIPOS: { tipo: BloqueEmail['tipo']; etiqueta: string; icono: string }[] = [
  { tipo: 'titulo', etiqueta: 'Título', icono: 'H' },
  { tipo: 'texto', etiqueta: 'Texto', icono: '¶' },
  { tipo: 'imagen', etiqueta: 'Imagen', icono: '▣' },
  { tipo: 'boton', etiqueta: 'Botón', icono: '▷' },
  { tipo: 'separador', etiqueta: 'Separador', icono: '—' },
];

const ICONO: Record<BloqueEmail['tipo'], string> = {
  titulo: 'H',
  texto: '¶',
  imagen: '▣',
  boton: '▷',
  separador: '—',
};

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
  const [subiendo, setSubiendo] = useState<number | null>(null);

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

  async function subirImagen(i: number, archivo: File) {
    setSubiendo(i);
    setEstado(null);
    const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const ruta = `${campanaId}/${Date.now()}-${nombreLimpio}`;
    const { error } = await supabase.storage.from('marketing-imagenes').upload(ruta, archivo, {
      cacheControl: '31536000',
      upsert: false,
    });
    setSubiendo(null);
    if (error) {
      setEstado(error.message);
      return;
    }
    const { data } = supabase.storage.from('marketing-imagenes').getPublicUrl(ruta);
    cambiar(i, { url: data.publicUrl });
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 18, alignItems: 'start' }}>
      <div>
        <div className="card">
          <h2>Contenido</h2>
          <div className="dos-columnas">
            <label className="campo-editor">
              <span>Nombre de la campaña</span>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <label className="campo-editor">
              <span>Asunto del email</span>
              <input type="text" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Novedades de sfbathroom" />
            </label>
          </div>
        </div>

        <div className="card">
          <h2>Bloques del email</h2>
          <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: 13 }}>
            Arrastra con el asa para ordenar. Los cambios se ven al instante en la vista previa.
          </p>

          {bloques.length === 0 ? (
            <div
              style={{
                border: '1px dashed var(--border-2)',
                borderRadius: 12,
                padding: 28,
                textAlign: 'center',
                color: 'var(--muted)',
                marginBottom: 12,
              }}
            >
              El email está vacío. Añade un bloque para empezar.
            </div>
          ) : null}

          {bloques.map((b, i) => (
            <div
              key={i}
              draggable
              onDragStart={() => setArrastrando(i)}
              onDragEnd={() => setArrastrando(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltar(i)}
              className={`bloque-editor${arrastrando === i ? ' arrastrando' : ''}`}
            >
              <div className="bloque-cabecera">
                <span className="bloque-icono" aria-hidden="true">{ICONO[b.tipo]}</span>
                <span className="bloque-tipo">{b.tipo}</span>
                <span className="bloque-acciones">
                  <button type="button" className="boton icono" title="Subir" onClick={() => mover(i, -1)}>↑</button>
                  <button type="button" className="boton icono" title="Bajar" onClick={() => mover(i, 1)}>↓</button>
                  <button
                    type="button"
                    className="boton icono"
                    title="Eliminar"
                    onClick={() => setBloques(bloques.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </span>
              </div>

              {b.tipo === 'titulo' ? (
                <label className="campo-editor" style={{ marginBottom: 0 }}>
                  <span>Texto del título</span>
                  <input type="text" value={b.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} />
                </label>
              ) : null}

              {b.tipo === 'texto' ? (
                <label className="campo-editor" style={{ marginBottom: 0 }}>
                  <span>Párrafo</span>
                  <textarea
                    value={b.texto}
                    onChange={(e) => cambiar(i, { texto: e.target.value })}
                    placeholder="Escribe aquí el mensaje…"
                  />
                </label>
              ) : null}

              {b.tipo === 'imagen' ? (
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                    <label
                      className="boton boton-suave"
                      style={{ cursor: subiendo === i ? 'wait' : 'pointer', opacity: subiendo === i ? 0.6 : 1 }}
                    >
                      {subiendo === i ? 'Subiendo…' : 'Subir imagen'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        disabled={subiendo === i}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void subirImagen(i, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <span style={{ fontSize: 12, color: 'var(--tenue)' }}>o pega una URL</span>
                  </div>
                  <div className="dos-columnas">
                    <label className="campo-editor" style={{ marginBottom: 0 }}>
                      <span>URL de la imagen</span>
                      <input type="url" value={b.url} onChange={(e) => cambiar(i, { url: e.target.value })} placeholder="https://…" />
                    </label>
                    <label className="campo-editor" style={{ marginBottom: 0 }}>
                      <span>Enlace al pulsar (opcional)</span>
                      <input type="url" value={b.enlace ?? ''} onChange={(e) => cambiar(i, { enlace: e.target.value })} placeholder="https://…" />
                    </label>
                  </div>
                  {b.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.url}
                      alt=""
                      style={{ marginTop: 10, maxHeight: 120, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border-2)' }}
                    />
                  ) : null}
                </div>
              ) : null}

              {b.tipo === 'boton' ? (
                <div className="dos-columnas">
                  <label className="campo-editor" style={{ marginBottom: 0 }}>
                    <span>Texto del botón</span>
                    <input type="text" value={b.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} />
                  </label>
                  <label className="campo-editor" style={{ marginBottom: 0 }}>
                    <span>Enlace</span>
                    <input type="url" value={b.url} onChange={(e) => cambiar(i, { url: e.target.value })} />
                  </label>
                </div>
              ) : null}

              {b.tipo === 'separador' ? (
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-2)', margin: 0 }} />
              ) : null}
            </div>
          ))}

          <div className="barra-bloques">
            <span style={{ fontSize: 12, color: 'var(--tenue)', marginRight: 4 }}>Añadir:</span>
            {TIPOS.map((t) => (
              <button
                key={t.tipo}
                type="button"
                className="boton boton-suave"
                onClick={() => setBloques([...bloques, bloqueVacio(t.tipo)])}
              >
                <span aria-hidden="true">{t.icono}</span> {t.etiqueta}
              </button>
            ))}
          </div>

          {estado ? <p className="nota">{estado}</p> : null}
          <div style={{ marginTop: 14 }}>
            <button type="button" className="boton boton-primario" onClick={guardar} disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar campaña'}
            </button>
          </div>
        </div>
      </div>

      <div className="previsualizacion">
        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Vista previa</h2>
          <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: 12 }}>Así lo verá el cliente en su correo.</p>
          <div className="previsualizacion-marco">
            <iframe title="Vista previa" srcDoc={html} />
          </div>
        </div>
      </div>
    </div>
  );
}
