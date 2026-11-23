'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function EditorContactoCliente({
  clienteId,
  personaContacto,
  telefono,
  email,
}: {
  clienteId: string;
  personaContacto: string | null;
  telefono: string | null;
  email: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [persona, setPersona] = useState(personaContacto ?? '');
  const [tel, setTel] = useState(telefono ?? '');
  const [mail, setMail] = useState(email ?? '');
  const [estado, setEstado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  function guardar() {
    startTransition(async () => {
      const { error } = await supabase
        .from('clientes')
        .update({
          persona_contacto: persona.trim() || null,
          telefono: tel.trim() || null,
          email: mail.trim() || null,
        })
        .eq('id', clienteId);
      if (error) setEstado({ ok: false, mensaje: error.message });
      else {
        setEstado({ ok: true, mensaje: 'Datos de contacto guardados.' });
        router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <h2>Datos de contacto</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="campo-filtro" style={{ minWidth: 220 }}>
          Persona de contacto
          <input type="text" value={persona} onChange={(e) => setPersona(e.target.value)} />
        </label>
        <label className="campo-filtro">
          Teléfono
          <input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
        </label>
        <label className="campo-filtro" style={{ minWidth: 240 }}>
          Email
          <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
        </label>
      </div>
      {estado ? (
        <p className="nota" style={estado.ok ? undefined : { color: 'var(--rojo)' }}>{estado.mensaje}</p>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="boton" onClick={guardar} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar contacto'}
        </button>
      </div>
    </div>
  );
}
