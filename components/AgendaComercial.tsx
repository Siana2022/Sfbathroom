'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AgendaData } from '@/lib/datos/agenda';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AgendaComercial({ datos }: { datos: AgendaData }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(hoyISO());
  const [hora, setHora] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [notas, setNotas] = useState('');

  const hoy = hoyISO();
  const pendientes = datos.eventos
    .filter((e) => !e.completada && e.fecha >= hoy)
    .sort((a, b) => (a.fecha + (a.hora ?? '')).localeCompare(b.fecha + (b.hora ?? '')));
  const pasadas = datos.eventos
    .filter((e) => e.completada || e.fecha < hoy)
    .sort((a, b) => (b.fecha + (b.hora ?? '')).localeCompare(a.fecha + (a.hora ?? '')))
    .slice(0, 30);

  async function crear() {
    if (!datos.comercialId || !titulo.trim()) return;
    setError(null);
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda').insert({
        empresa_id: datos.empresaId,
        comercial_id: datos.comercialId,
        cliente_id: clienteId || null,
        fecha,
        hora: hora || null,
        titulo: titulo.trim(),
        notas: notas.trim() || null,
      });
      if (e) setError(e.message);
      else {
        setTitulo('');
        setNotas('');
        setClienteId('');
        router.refresh();
      }
    });
  }

  async function alternar(id: string, completada: boolean) {
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda').update({ completada: !completada }).eq('id', id);
      if (e) setError(e.message);
      else router.refresh();
    });
  }

  async function borrar(id: string) {
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda').delete().eq('id', id);
      if (e) setError(e.message);
      else router.refresh();
    });
  }

  return (
    <div>
      {datos.esComercial && datos.comercialId ? (
        <div className="card">
          <h2>Nueva entrada</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="campo-filtro">
              Fecha
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="campo-filtro">
              Hora
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </label>
            <label className="campo-filtro" style={{ minWidth: 240 }}>
              Cliente (opcional)
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">—</option>
                {datos.clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label className="campo-filtro" style={{ flex: 1, minWidth: 260 }}>
              Título
              <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Visita, llamada, muestra…" />
            </label>
          </div>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas"
            rows={2}
            style={{ width: '100%', marginTop: 10, padding: 10, border: '1px solid var(--border-2)', borderRadius: 8 }}
          />
          {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={crear} disabled={pending || !titulo.trim()}>
              {pending ? 'Guardando…' : 'Añadir a la agenda'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2>Pendientes</h2>
        {pendientes.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin entradas pendientes.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Notas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendientes.map((e) => (
                <tr key={e.id}>
                  <td>{e.fecha}</td>
                  <td>{e.hora ? e.hora.slice(0, 5) : '—'}</td>
                  <td>{e.titulo}</td>
                  <td>{e.clienteNombre ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{e.notas ?? '—'}</td>
                  <td>
                    <button type="button" className="boton" onClick={() => alternar(e.id, e.completada)} disabled={pending}>
                      Hecho
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Completadas y pasadas</h2>
        {pasadas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin historial.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pasadas.map((e) => (
                <tr key={e.id}>
                  <td>{e.fecha}</td>
                  <td>{e.titulo}</td>
                  <td>{e.clienteNombre ?? '—'}</td>
                  <td>{e.completada ? 'Completada' : 'Pasada'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="boton" onClick={() => alternar(e.id, e.completada)} disabled={pending}>
                      {e.completada ? 'Reabrir' : 'Hecho'}
                    </button>{' '}
                    <button type="button" className="boton" onClick={() => borrar(e.id)} disabled={pending}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
