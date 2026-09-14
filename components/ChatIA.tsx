'use client';
import { useState, useRef, useEffect, type FormEvent, type ReactNode } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string; datos?: unknown };

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(texto: string): ReactNode[] {
  const huecos = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return huecos.map((h, i) => {
    if (h.startsWith('**') && h.endsWith('**')) return <strong key={i}>{h.slice(2, -2)}</strong>;
    if (h.startsWith('`') && h.endsWith('`')) return <code key={i} className="chat-code">{h.slice(1, -1)}</code>;
    return h;
  });
}

function renderMarkdown(texto: string): ReactNode[] {
  const lineas = texto.split(/\r?\n/);
  const hijos: ReactNode[] = [];
  let buffer = '';
  let i = 0;
  let idx = 0;
  const pushBuffer = () => {
    if (!buffer.trim()) return;
    const paras = buffer.split(/\n{2,}/);
    for (const p of paras) {
      if (!p.trim()) continue;
      hijos.push(<p key={idx++} className="chat-p">{renderInline(p.trim())}</p>);
    }
    buffer = '';
  };
  while (i < lineas.length) {
    const l = lineas[i];
    if (l.trim().startsWith('|')) {
      const filas: string[] = [l];
      let j = i + 1;
      while (j < lineas.length && lineas[j].trim().startsWith('|')) { filas.push(lineas[j]); j++; }
      if (filas.length >= 2 && /^\s*\|?[\s:|-]+\|?\s*$/.test(filas[1].trim().replace(/\|/g, ''))) {
        pushBuffer();
        const cab = filas[0].split('|').map((c) => c.trim()).filter(Boolean);
        const cuerpo = filas.slice(2).map((f) => f.split('|').map((c) => c.trim()).filter(Boolean));
        hijos.push(
          <div key={idx++} style={{ overflowX: 'auto', margin: '6px 0' }}>
            <table className="tabla">
              <thead>
                <tr>{cab.map((c, k) => <th key={k}>{renderInline(c)}</th>)}</tr>
              </thead>
              <tbody>
                {cuerpo.map((r, k) => (
                  <tr key={k}>{r.map((c, m) => <td key={m}>{renderInline(c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        i = j;
        continue;
      }
    }
    buffer += (buffer ? '\n' : '') + l;
    i++;
  }
  pushBuffer();
  return hijos;
}

const TABLA_DATOS: Record<string, { campos: string[]; etiquetas: string[] }> = {
  por_mes: { campos: ['etiqueta', 'neta', 'unidades', 'documentos'], etiquetas: ['Mes', 'Netas', 'Unid.', 'Docs'] },
  principales: { campos: ['cliente', 'importe', 'peso_pct'], etiquetas: ['Cliente', 'Importe', '%'] },
};

function renderTabla(datos: unknown): React.ReactNode {
  if (!datos || typeof datos !== 'object') return null;
  const obj = datos as Record<string, unknown>;
  for (const [clave, cfg] of Object.entries(TABLA_DATOS)) {
    const filas = obj[clave];
    if (!Array.isArray(filas) || filas.length === 0) continue;
    return (
      <div style={{ marginTop: 10, overflowX: 'auto' }}>
        <table className="tabla">
          <thead>
            <tr>{cfg.etiquetas.map((e) => <th key={e}>{e}</th>)}</tr>
          </thead>
          <tbody>
            {filas.map((fila: Record<string, string | number>, i: number) => (
              <tr key={i}>
                {cfg.campos.map((c) => (
                  <td key={c} className={c.includes('neta') || c === 'importe' ? 'td-num' : c === 'peso_pct' ? 'td-num' : undefined}>
                    {typeof fila[c] === 'number' ? Math.round(Number(fila[c])).toLocaleString('es-ES') : String(fila[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function ChatIA() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);
  useEffect(() => { if (abierto) inputRef.current?.focus(); }, [abierto]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const texto = input.trim();
    if (!texto || pendiente) return;
    setInput('');
    const nuevos = [...mensajes, { role: 'user' as const, content: texto }];
    setMensajes(nuevos);
    setPendiente(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensajes: nuevos.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (res.ok) setMensajes((m) => [...m, { role: 'assistant', content: data.texto, datos: data.datos }]);
      else setMensajes((m) => [...m, { role: 'assistant', content: `Error: ${data.error ?? 'No se pudo conectar.'}` }]);
    } catch {
      setMensajes((m) => [...m, { role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' }]);
    } finally {
      setPendiente(false);
    }
  }

  return (
    <>
      <button className="chat-fab" onClick={() => setAbierto((a) => !a)} aria-label="Abrir asistente IA">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      {abierto && (
        <div className="chat-panel">
          <div className="chat-toolbar">
            <strong>Asistente BI</strong>
            <button className="chat-x" onClick={() => setAbierto(false)} aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="chat-mensajes">
            {mensajes.length === 0 && (
              <p style={{ color: 'var(--muted)', textAlign: 'center', margin: '24px 0', fontSize: 13 }}>
                Ejemplos: "¿Cómo va la facturación?", "Top clientes", "Variación vs 2025"
              </p>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'chat-msg-user' : 'chat-msg-ia'}>
                {m.role === 'user' ? escapar(m.content) : renderMarkdown(m.content)}
                {m.datos ? renderTabla(m.datos) : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <form className="chat-input" onSubmit={enviar}>
            <input
              ref={inputRef}
              placeholder={pendiente ? 'Pensando...' : 'Pregunta a la IA...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={pendiente}
            />
            <button type="submit" className="boton" disabled={pendiente || !input.trim()}>
              {pendiente ? '…' : 'Enviar'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}