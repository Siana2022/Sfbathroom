'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
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
  const clienteSel = datos.clientes.find((c) => c.id === clienteId);
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

  const cambiarMes = (delta: number) => {
    const [anio, mesN] = mes.split('-').map(Number);
    const d = new Date(anio, mesN - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div>
      {puedeCrear ? (
        <div className="card" id="nueva">
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
          {clienteSel ? (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
              {clienteSel.personaContacto ? <>Contacto: {clienteSel.personaContacto} · </> : null}
              {clienteSel.telefono ? <>Tel. {clienteSel.telefono} · </> : null}
              {clienteSel.email ? <>{clienteSel.email}</> : null}
            </div>
          ) : null}
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
                    <Link
                      key={e.id}
                      href={`/agenda/${e.id}`}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        marginTop: 4,
                        padding: '3px 6px',
                        borderRadius: 6,
                        fontSize: 11,
                        textDecoration: e.estado === 'cancelada' || e.estado === 'perdida' ? 'line-through' : 'none',
                        background:
                          e.estado === 'ganada'
                            ? '#eaf4ee'
                            : e.estado === 'perdida'
                              ? '#fbeceb'
                              : e.estado === 'realizada'
                                ? '#fbf7ec'
                                : e.estado === 'cancelada'
                                  ? '#eeeeee'
                                  : 'var(--accent-soft, #e8f0fb)',
                      }}
                      title={`${e.asunto} · ${e.clienteNombre ?? ''}`}
                    >
                      {e.hora ? `${e.hora.slice(0, 5)} ` : ''}{e.asunto}
                    </Link>
                  ))}
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {(() => {
        const d = new Date(`${hoy}T00:00:00`);
        const offset = (d.getDay() + 6) % 7;
        const lunes = new Date(d.getTime() - offset * 86400000);
        const domingo = new Date(lunes.getTime() + 6 * 86400000);
        const l = ymd(lunes);
        const r = ymd(domingo);
        const semana = datos.eventos
          .filter((e) => e.fecha >= l && e.fecha <= r)
          .sort((a, b) => (a.fecha + (a.hora ?? '')).localeCompare(b.fecha + (b.hora ?? '')));
        return (
          <div className="card">
            <h2>Esta semana</h2>
            {semana.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Sin reuniones esta semana.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {semana.map((e) => (
                  <li key={e.id} style={{ marginBottom: 6 }}>
                    {e.fecha} {e.hora ? `· ${e.hora.slice(0, 5)}` : ''} ·{' '}
                    <Link href={`/agenda/${e.id}`} className="enlace">{e.asunto}</Link>
                    {e.clienteNombre ? ` · ${e.clienteNombre}` : ''}
                    {' '}
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>({e.estado})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      <div className="card">
        <h2>Atrasadas</h2>
        {datos.eventos.filter((e) => e.estado === 'programada' && e.fecha < hoy).length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Nada atrasado.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Asunto</th>
                <th>Tipo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {datos.eventos
                .filter((e) => e.estado === 'programada' && e.fecha < hoy)
                .sort((a, b) => a.fecha.localeCompare(b.fecha))
                .map((e) => (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--rojo)' }}>{e.fecha}</td>
                    <td>{e.hora ? e.hora.slice(0, 5) : '—'}</td>
                    <td>{e.clienteNombre ?? '—'}</td>
                    <td>{e.asunto}</td>
                    <td>{TIPOS.find((t) => t.valor === e.tipo)?.etiqueta ?? e.tipo}</td>
                    <td><Link href={`/agenda/${e.id}`} className="boton">Abrir</Link></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
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
                    <Link href={`/agenda/${e.id}`} className="boton">Abrir</Link>
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
