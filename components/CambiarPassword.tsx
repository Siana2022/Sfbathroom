'use client';
import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function CambiarPassword({ email }: { email: string | null }) {
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    setMensaje(null);
    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (nueva !== repetida) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    startTransition(async () => {
      if (actual && email) {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password: actual });
        if (e) {
          setError('La contraseña actual no es correcta.');
          return;
        }
      }
      const { error: e } = await supabase.auth.updateUser({ password: nueva });
      if (e) setError(e.message);
      else {
        setMensaje('Contraseña actualizada.');
        setActual('');
        setNueva('');
        setRepetida('');
      }
    });
  }

  return (
    <div className="card">
      <h2>Cambiar contraseña</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="campo-editor" style={{ minWidth: 220 }}>
          <span>Contraseña actual</span>
          <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="campo-editor" style={{ minWidth: 220 }}>
          <span>Nueva contraseña</span>
          <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="campo-editor" style={{ minWidth: 220 }}>
          <span>Repite la nueva</span>
          <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
      {mensaje ? <p className="nota">{mensaje}</p> : null}
      <button type="button" className="boton boton-primario" onClick={guardar} disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar contraseña'}
      </button>
    </div>
  );
}
