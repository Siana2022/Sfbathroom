'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { EventoAgenda } from '@/lib/datos/agenda';

const TIPOS: Record<string, string> = {
  presencial: 'Presencial',
  online: 'Online',
  telefonica: 'Telefónica',
  email: 'Email',
};

export default function DetalleReunion({
  evento,
  empresaId,
  comercialId,
}: {
  evento: EventoAgenda;
  empresaId: string;
  comercialId: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fechaNueva, setFechaNueva] = useState(evento.fecha);
  const [horaNueva, setHoraNueva] = useState(evento.hora ? evento.hora.slice(0, 5) : '');
  const [reagendando, setReagendando] = useState(false);

  async function añadirNota() {
    if (!nota.trim()) return;
    setError(null);
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda_notas').insert({
        agenda_id: evento.id,
        empresa_id: empresaId,
        comercial_id: comercialId,
        texto: nota.trim(),
      });
      if (e) setError(e.message);
      else {
        setNota('');
        router.refresh();
      }
    });
  }

  async function alternar() {
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda').update({ completada: !evento.completada }).eq('id', evento.id);
      if (e) {
        setError(e.message);
        return;
      }
      await supabase.from('agenda_notas').insert({
        agenda_id: evento.id,
        empresa_id: empresaId,
        comercial_id: comercialId,
        texto: evento.completada ? 'Reunión reabierta.' : 'Reunión marcada como hecha.',
      });
      router.refresh();
    });
  }

  async function reagendar() {
    if (!fechaNueva) return;
    setReagendando(true);
    const antes = `${evento.fecha}${evento.hora ? ` ${evento.hora.slice(0, 5)}` : ''}`;
    const despues = `${fechaNueva}${horaNueva ? ` ${horaNueva}` : ''}`;
    const { error: e } = await supabase
      .from('agenda')
      .update({ fecha: fechaNueva, hora: horaNueva || null })
      .eq('id', evento.id);
    if (e) {
      setError(e.message);
      setReagendando(false);
      return;
    }
    await supabase.from('agenda_notas').insert({
      agenda_id: evento.id,
      empresa_id: empresaId,
      comercial_id: comercialId,
      texto: `Reagendada: ${antes} → ${despues}`,
    });
    setReagendando(false);
    router.refresh();
  }

  async function borrar() {
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda').delete().eq('id', evento.id);
      if (e) setError(e.message);
      else router.push('/agenda');
    });
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Fecha</div>
            <strong>{evento.fecha}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Hora</div>
            <strong>{evento.hora ? evento.hora.slice(0, 5) : '—'}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Cliente</div>
            <strong>{evento.clienteNombre ?? '—'}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Tipo</div>
            <strong>{TIPOS[evento.tipo] ?? evento.tipo}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Estado</div>
            <strong>{evento.completada ? 'Hecha' : 'Pendiente'}</strong>
          </div>
        </div>
        {evento.notas ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Notas iniciales</div>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{evento.notas}</p>
          </div>
        ) : null}

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-2)' }}>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Reagendar</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="campo-filtro">
              Nueva fecha
              <input type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} />
            </label>
            <label className="campo-filtro">
              Nueva hora
              <input type="time" value={horaNueva} onChange={(e) => setHoraNueva(e.target.value)} />
            </label>
            <button type="button" className="boton" onClick={reagendar} disabled={pending || reagendando || !fechaNueva}>
              {reagendando ? 'Guardando…' : 'Reagendar'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Seguimiento completo</h2>
        {evento.seguimiento.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin notas todavía.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {evento.seguimiento.map((n) => (
              <li key={n.id} style={{ marginBottom: 12 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {n.fecha.slice(0, 16).replace('T', ' ')}
                </span>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</div>
              </li>
            ))}
          </ul>
        )}

        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Añadir nota de seguimiento"
          rows={3}
          style={{ width: '100%', marginTop: 10, padding: 10, border: '1px solid var(--border-2)', borderRadius: 8 }}
        />
        {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" className="boton" onClick={añadirNota} disabled={pending || !nota.trim()}>
            Guardar nota
          </button>
          <button type="button" className="boton" onClick={alternar} disabled={pending}>
            {evento.completada ? 'Reabrir' : 'Marcar hecha'}
          </button>
          <button type="button" className="boton" onClick={borrar} disabled={pending}>
            Borrar reunión
          </button>
        </div>
      </div>
    </div>
  );
}
