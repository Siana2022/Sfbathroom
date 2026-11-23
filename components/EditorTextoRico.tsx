'use client';
import { useEffect, useRef, useState } from 'react';

function Boton({
  etiqueta,
  titulo,
  onClick,
  activo,
  ancho,
}: {
  etiqueta: string;
  titulo: string;
  onClick: () => void;
  activo?: boolean;
  ancho?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={activo ? 'true' : 'false'}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        border: activo ? '1px solid var(--accent)' : '1px solid var(--border-2)',
        background: activo ? 'var(--accent)' : '#fff',
        color: activo ? '#fff' : 'var(--text)',
        borderRadius: 6,
        width: ancho ? 38 : 30,
        height: 28,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: activo ? 700 : 400,
      }}
    >
      {etiqueta}
    </button>
  );
}

export default function EditorTextoRico({
  valor,
  onCambio,
}: {
  valor: string;
  onCambio: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [activos, setActivos] = useState({ bold: false, italic: false, underline: false, ul: false, ol: false });

  useEffect(() => {
    const actualizar = () => {
      const el = ref.current;
      const sel = document.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
      try {
        setActivos({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          ul: document.queryCommandState('insertUnorderedList'),
          ol: document.queryCommandState('insertOrderedList'),
        });
      } catch {
        /* algunos navegadores no permiten consultar el estado */
      }
    };
    document.addEventListener('selectionchange', actualizar);
    return () => document.removeEventListener('selectionchange', actualizar);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== valor) {
      el.innerHTML = valor;
    }
  }, [valor]);

  function ejecutar(comando: string, argumento?: string) {
    ref.current?.focus();
    document.execCommand(comando, false, argumento);
    if (ref.current) onCambio(ref.current.innerHTML);
    setActivos({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <Boton etiqueta="B" titulo="Negrita" activo={activos.bold} onClick={() => ejecutar('bold')} />
        <Boton etiqueta="I" titulo="Cursiva" activo={activos.italic} onClick={() => ejecutar('italic')} />
        <Boton etiqueta="U" titulo="Subrayado" activo={activos.underline} onClick={() => ejecutar('underline')} />
        <Boton etiqueta="•" titulo="Lista" activo={activos.ul} onClick={() => ejecutar('insertUnorderedList')} />
        <Boton etiqueta="1." titulo="Lista numerada" activo={activos.ol} ancho onClick={() => ejecutar('insertOrderedList')} />
        <Boton
          etiqueta="🔗"
          titulo="Enlace"
          onClick={() => {
            const url = window.prompt('URL del enlace', 'https://');
            if (url) ejecutar('createLink', url);
          }}
        />
        <Boton etiqueta="✕" titulo="Quitar formato" onClick={() => ejecutar('removeFormat')} />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          if (ref.current) onCambio(ref.current.innerHTML);
        }}
        style={{
          minHeight: 110,
          border: '1px solid var(--border-2)',
          borderRadius: 9,
          padding: '10px 12px',
          fontSize: 14,
          lineHeight: 1.6,
          background: '#fff',
          outline: 'none',
        }}
      />
      <p style={{ fontSize: 11, color: 'var(--tenue)', margin: '6px 0 0' }}>
        Selecciona el texto y usa la barra para dar formato. Los enlaces se abren en el correo.
      </p>
    </div>
  );
}
