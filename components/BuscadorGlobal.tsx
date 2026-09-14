'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BuscadorGlobal() {
  const router = useRouter();
  const [q, setQ] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName ?? '')) {
        e.preventDefault();
        document.getElementById('buscador-global')?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const valor = q.trim();
    if (valor.length >= 2) router.push(`/buscar?q=${encodeURIComponent(valor)}`);
  }

  return (
    <form onSubmit={buscar} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        id="buscador-global"
        className="input-dato"
        placeholder="Buscar cliente, factura, artículo…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ minWidth: 220, maxWidth: 300 }}
        aria-label="Buscar"
      />
      <button type="submit" className="btn secundario" style={{ padding: '6px 10px', fontSize: 12 }}>/</button>
    </form>
  );
}