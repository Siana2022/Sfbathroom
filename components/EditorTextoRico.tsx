'use client';
import { useEffect, useRef } from 'react';

function Boton({ etiqueta, titulo, onClick }: { etiqueta: string; titulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={titulo}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        border: '1px solid var(--border-2)',
        background: '#fff',
        borderRadius: 6,
        width: 30,
        height: 28,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--text)',
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
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <Boton etiqueta="B" titulo="Negrita" onClick={() => ejecutar('bold')} />
        <Boton etiqueta="I" titulo="Cursiva" onClick={() => ejecutar('italic')} />
        <Boton etiqueta="U" titulo="Subrayado" onClick={() => ejecutar('underline')} />
        <Boton etiqueta="•" titulo="Lista" onClick={() => ejecutar('insertUnorderedList')} />
        <Boton etiqueta="1." titulo="Lista numerada" onClick={() => ejecutar('insertOrderedList')} />
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
