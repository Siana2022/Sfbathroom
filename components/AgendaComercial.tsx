'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AgendaData, EventoAgenda } from '@/lib/datos/agenda';

const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: 'presencial', etiqueta: 'Presencial' },
  { valor: 'online', etiqueta: 'Online' },
  { valor: 'telefonica', etiqueta: 'Telefónica' },
  { valor: 'email', etiqueta: 'Email' },
];

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AgendaComercial({ datos }: { datos: AgendaData }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hoy = hoyISO();
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [asunto, setAsunto] = useState('');
  const [tipo, setTipo] = useState('presencial');
  const [notas, setNotas] = useState('');

  const [mes, setMes] = useState(() => hoy.slice(0, 7));
  const [sel, setSel] = useState<EventoAgenda | null>(null);
  const [nuevaNota, setNuevaNota] = useState('');

  const porFecha = useMemo(() => {
    const m = new Map<string, EventoAgenda[]>();
    for (const e of datos.eventos) {
      const arr = m.get(e.fecha) ?? [];
      arr.push(e);
      m.set(e.fecha, arr);
    }
    return m;
  }, [datos.eventos]);

  const celdas = useMemo(() => {
    const [anio, mesN] = mes.split('-').map(Number);
    const primero = new Date(anio, mesN - 1, 1);
    const offset = (primero.getDay() + 6) % 7; // lunes = 0
    const diasMes = new Date(anio, mesN, 0).getDate();
    const lista: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= diasMes; d++) lista.push(ymd(new Date(anio, mesN - 1, d)));
    return lista;
  }, [mes]);

  const puedeCrear = datos.esComercial && datos.comercialId;
  const proximas = datos.eventos
    .filter((e) => !e.completada && e.fecha >= hoy)
    .sort((a, b) => (a.fecha + (a.hora ?? '')).localeCompare(b.fecha + (b.hora ?? '')))
    .slice(0, 8);

  async function crear() {
    if (!datos.comercialId || !clienteId || !asunto.trim() || !fecha) return;
    setError(null);
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda').insert({
        empresa_id: datos.empresaId,
        comercial_id: datos.comercialId,
        cliente_id: clienteId,
        fecha,
        hora: hora || null,
        asunto: asunto.trim(),
        tipo,
        notas: notas.trim() || null,
      });
      if (e) setError(e.message);
      else {
        setAsunto('');
        setNotas('');
        setClienteId('');
        router.refresh();
      }
    });
  }

  async function alternar(e: EventoAgenda) {
    startTransition(async () => {
      const { error: err } = await supabase.from('agenda').update({ completada: !e.completada }).eq('id', e.id);
      if (err) setError(err.message);
      else {
        setSel(null);
        router.refresh();
      }
    });
  }

  async function borrar(id: string) {
    startTransition(async () => {
      const { error: err } = await supabase.from('agenda').delete().eq('id', id);
      if (err) setError(err.message);
      else {
        setSel(null);
        router.refresh();
      }
    });
  }

  async function añadirNota(e: EventoAgenda) {
    if (!nuevaNota.trim()) return;
    startTransition(async () => {
      const { error: err } = await supabase.from('agenda_notas').insert({
        agenda_id: e.id,
        empresa_id: datos.empresaId,
        comercial_id: datos.comercialId,
        texto: nuevaNota.trim(),
      });
      if (err) setError(err.message);
      else {
        setNuevaNota('');
        setSel(null);
        router.refresh();
      }
    });
  }

  const cambiarMes = (delta: number) => {
    const [anio, mesN] = mes.split('-').map(Number);
    const d = new Date(anio, mesN - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div>
      {puedeCrear ? (
        <div className="card">
          <h2>Nueva reunión</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="campo-filtro">
              Fecha *
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="campo-filtro">
              Hora
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </label>
            <label className="campo-filtro" style={{ minWidth: 240 }}>
              Cliente *
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">—</option>
                {datos.clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label className="campo-filtro">
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="campo-filtro" style={{ flex: 1, minWidth: 240 }}>
              Asunto *
              <input type="text" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Presentación, seguimiento…" />
            </label>
          </div>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas de seguimiento"
            rows={2}
            style={{ width: '100%', marginTop: 10, padding: 10, border: '1px solid var(--border-2)', borderRadius: 8 }}
          />
          {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={crear} disabled={pending || !asunto.trim() || !clienteId}>
              {pending ? 'Guardando…' : 'Añadir reunión'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, textTransform: 'capitalize' }}>
            {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="boton" onClick={() => cambiarMes(-1)}>←</button>
            <button type="button" className="boton" onClick={() => setMes(hoy.slice(0, 7))}>Hoy</button>
            <button type="button" className="boton" onClick={() => cambiarMes(1)}>→</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 12 }}>
          {DIAS.map((d) => (
            <div key={d} style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', fontWeight: 700 }}>{d}</div>
          ))}
          {celdas.map((f, i) => (
            <div
              key={`${f ?? 'v'}-${i}`}
              style={{
                minHeight: 84,
                border: '1px solid var(--border-2)',
                borderRadius: 8,
                padding: 6,
                background: f === hoy ? 'var(--wash)' : 'transparent',
              }}
            >
              {f ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{Number(f.slice(8, 10))}</div>
                  {(porFecha.get(f) ?? []).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSel(e)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        marginTop: 4,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 11,
                        background: e.completada ? 'var(--wash)' : 'var(--accent-soft, #e8f0fb)',
                        textDecoration: e.completada ? 'line-through' : 'none',
                      }}
                      title={`${e.asunto} · ${e.clienteNombre ?? ''}`}
                    >
                      {e.hora ? `${e.hora.slice(0, 5)} ` : ''}{e.asunto}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Próximas reuniones</h2>
        {proximas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin reuniones pendientes.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Asunto</th>
                <th>Tipo</th>
                <th>Notas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {proximas.map((e) => (
                <tr key={e.id}>
                  <td>{e.fecha}</td>
                  <td>{e.hora ? e.hora.slice(0, 5) : '—'}</td>
                  <td>{e.clienteNombre ?? '—'}</td>
                  <td>{e.asunto}</td>
                  <td>{TIPOS.find((t) => t.valor === e.tipo)?.etiqueta ?? e.tipo}</td>
                  <td>{e.seguimiento.length}</td>
                  <td>
                    <button type="button" className="boton" onClick={() => setSel(e)}>Abrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sel ? (
        <div className="modal-fondo" onClick={() => setSel(null)} role="dialog" aria-modal="true">
          <div className="modal-caja modal-ancho" onClick={(ev) => ev.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{sel.asunto}</h3>
                <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
                  {sel.fecha} {sel.hora ? `· ${sel.hora.slice(0, 5)}` : ''} · {sel.clienteNombre ?? '—'} ·{' '}
                  {TIPOS.find((t) => t.valor === sel.tipo)?.etiqueta ?? sel.tipo}
                </p>
              </div>
              <button type="button" className="modal-cerrar" onClick={() => setSel(null)} aria-label="Cerrar">✕</button>
            </div>

            {sel.notas ? (
              <p style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{sel.notas}</p>
            ) : null}

            <h4 style={{ margin: '16px 0 6px' }}>Notas de seguimiento</h4>
            {sel.seguimiento.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Sin notas todavía.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {sel.seguimiento.map((n) => (
                  <li key={n.id} style={{ marginBottom: 8 }}>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{n.fecha.slice(0, 16).replace('T', ' ')}</span>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</div>
                  </li>
                ))}
              </ul>
            )}

            <textarea
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              placeholder="Añadir nota de seguimiento"
              rows={3}
              style={{ width: '100%', marginTop: 10, padding: 10, border: '1px solid var(--border-2)', borderRadius: 8 }}
            />
            {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" className="boton" onClick={() => añadirNota(sel)} disabled={pending || !nuevaNota.trim()}>
                Guardar nota
              </button>
              <button type="button" className="boton" onClick={() => alternar(sel)} disabled={pending}>
                {sel.completada ? 'Reabrir' : 'Marcar hecha'}
              </button>
              <button type="button" className="boton" onClick={() => borrar(sel.id)} disabled={pending}>
                Borrar reunión
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
