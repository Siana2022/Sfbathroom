'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import SelectorBuscable from '@/components/SelectorBuscable';
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

export default function AgendaComercial({ datos, clienteInicial }: { datos: AgendaData; clienteInicial?: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hoy = hoyISO();
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState('');
  const [clienteId, setClienteId] = useState(clienteInicial ?? '');
  const [asunto, setAsunto] = useState('');
  const [tipo, setTipo] = useState('presencial');
  const [notas, setNotas] = useState('');

  const [mes, setMes] = useState(() => hoy.slice(0, 7));
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);

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
  const [contactos, setContactos] = useState<{ id: string; nombre: string; cargo: string | null; telefono: string | null; email: string | null; esPrincipal: boolean }[]>([]);
  const [contactoId, setContactoId] = useState('');
  const [refetch, setRefetch] = useState(0);
  const [formContacto, setFormContacto] = useState<{ modo: 'editar' | 'nuevo'; nombre: string; cargo: string; telefono: string; email: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!clienteId) {
      setContactos([]);
      setContactoId('');
      return;
    }
    supabase
      .from('clientes_contactos')
      .select('id, nombre, cargo, telefono, email, es_principal')
      .eq('cliente_id', clienteId)
      .order('es_principal', { ascending: false })
      .order('nombre')
      .then(({ data }) => {
        if (cancelado) return;
        const lista = ((data ?? []) as {
          id: string;
          nombre: string;
          cargo: string | null;
          telefono: string | null;
          email: string | null;
          es_principal: boolean;
        }[]).map((c) => ({
          id: c.id,
          nombre: c.nombre,
          cargo: c.cargo,
          telefono: c.telefono,
          email: c.email,
          esPrincipal: c.es_principal,
        }));
        setContactos(lista);
        setContactoId(lista.find((c) => c.esPrincipal)?.id ?? lista[0]?.id ?? '');
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId, refetch]);

  function moverA(id: string, nuevaFecha: string) {
    const ev = datos.eventos.find((e) => e.id === id);
    if (!ev || ev.fecha === nuevaFecha) return;
    startTransition(async () => {
      const { error } = await supabase.from('agenda').update({ fecha: nuevaFecha }).eq('id', id);
      if (error) {
        setError(error.message);
        return;
      }
      await supabase.from('agenda_cambios').insert({
        agenda_id: id,
        fecha_anterior: ev.fecha,
        hora_anterior: ev.hora,
        fecha_nueva: nuevaFecha,
        hora_nueva: ev.hora,
        motivo: 'Reprogramada desde el calendario',
      });
      await supabase.from('agenda_notas').insert({
        agenda_id: id,
        empresa_id: datos.empresaId,
        comercial_id: datos.comercialId,
        texto: `Reagendada: ${ev.fecha} → ${nuevaFecha}`,
        tipo: 'sistema',
      });
      router.refresh();
    });
  }

  function abrirEdicion() {
    const c = contactos.find((x) => x.id === contactoId) ?? contactos[0];
    if (!c) return;
    setFormContacto({ modo: 'editar', nombre: c.nombre, cargo: c.cargo ?? '', telefono: c.telefono ?? '', email: c.email ?? '' });
  }

  function abrirNuevo() {
    setFormContacto({ modo: 'nuevo', nombre: '', cargo: '', telefono: '', email: '' });
  }

  async function guardarFormContacto() {
    if (!formContacto || !formContacto.nombre.trim() || !clienteId) return;
    setGuardando(true);
    const cuerpo = {
      nombre: formContacto.nombre.trim(),
      cargo: formContacto.cargo.trim() || null,
      telefono: formContacto.telefono.trim() || null,
      email: formContacto.email.trim() || null,
    };
    let error = null as { message: string } | null;
    if (formContacto.modo === 'editar') {
      const { error: e } = await supabase
        .from('clientes_contactos')
        .update(cuerpo)
        .eq('id', contactoId);
      error = e;
    } else {
      const { data, error: e } = await supabase
        .from('clientes_contactos')
        .insert({
          empresa_id: datos.empresaId,
          cliente_id: clienteId,
          ...cuerpo,
          es_principal: contactos.length === 0,
        })
        .select('id')
        .single();
      error = e;
      if (data) setContactoId((data as { id: string }).id);
    }
    setGuardando(false);
    if (error) setError(error.message);
    else {
      setFormContacto(null);
      setRefetch((n) => n + 1);
    }
  }

  const proximas = datos.eventos
    .filter((e) => !e.completada && e.fecha >= hoy)
    .sort((a, b) => (a.fecha + (a.hora ?? '')).localeCompare(b.fecha + (b.hora ?? '')))
    .slice(0, 8);

  async function crear() {
    if (!datos.comercialId || !clienteId || !asunto.trim() || !fecha) return;
    setError(null);
    startTransition(async () => {
      const contacto = contactos.find((c) => c.id === contactoId) ?? null;
      const { error: e } = await supabase.from('agenda').insert({
        empresa_id: datos.empresaId,
        comercial_id: datos.comercialId,
        cliente_id: clienteId,
        contacto_id: contacto?.id ?? null,
        contacto_nombre: contacto?.nombre ?? null,
        contacto_telefono: contacto?.telefono ?? null,
        contacto_email: contacto?.email ?? null,
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
            {/* Buscable: se escribe parte del nombre en vez de recorrer un desplegable. */}
            <div style={{ minWidth: 260 }}>
              <SelectorBuscable
                etiqueta="Cliente *"
                opciones={datos.clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
                valor={clienteId}
                onChange={(id) => setClienteId(id ?? '')}
                textoTodos="—"
                placeholder="Escribe el nombre…"
              />
            </div>
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
            <div style={{ marginTop: 14 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Contacto del cliente</div>
              {contactos.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                  Este cliente no tiene contactos todavía. Puedes añadirlos en su ficha.
                </p>
              ) : (
                (() => {
                  const c = contactos.find((x) => x.id === contactoId) ?? contactos[0];
                  const iniciales = c.nombre
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('');
                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        border: '1px solid var(--border-2)',
                        borderRadius: 12,
                        background: 'var(--wash)',
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {iniciales || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          {c.nombre}
                          {c.esPrincipal ? (
                            <span className="badge listo" style={{ marginLeft: 8, fontSize: 10 }}>Principal</span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {c.telefono ? <a href={`tel:${c.telefono}`} className="enlace">{c.telefono}</a> : 'Sin teléfono'}
                          {c.email ? <> · <a href={`mailto:${c.email}`} className="enlace">{c.email}</a></> : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                        {contactos.length > 1 ? (
                          <select
                            value={contactoId}
                            onChange={(e) => setContactoId(e.target.value)}
                            style={{ padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 8, background: '#fff', maxWidth: 180 }}
                          >
                            {contactos.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.nombre}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button type="button" className="boton" onClick={abrirEdicion}>Editar</button>
                        <button type="button" className="boton" onClick={abrirNuevo}>Nuevo</button>
                      </div>
                    </div>
                  );
                })()
              )}

              {formContacto ? (
                <div style={{ marginTop: 10, padding: 12, border: '1px dashed var(--border-2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    {formContacto.modo === 'editar' ? 'Editar contacto' : 'Nuevo contacto'}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <label className="campo-filtro" style={{ minWidth: 180 }}>
                      Nombre *
                      <input type="text" value={formContacto.nombre} onChange={(e) => setFormContacto({ ...formContacto, nombre: e.target.value })} />
                    </label>
                    <label className="campo-filtro">
                      Cargo
                      <input type="text" value={formContacto.cargo} onChange={(e) => setFormContacto({ ...formContacto, cargo: e.target.value })} />
                    </label>
                    <label className="campo-filtro">
                      Teléfono
                      <input type="tel" value={formContacto.telefono} onChange={(e) => setFormContacto({ ...formContacto, telefono: e.target.value })} />
                    </label>
                    <label className="campo-filtro" style={{ minWidth: 200 }}>
                      Email
                      <input type="email" value={formContacto.email} onChange={(e) => setFormContacto({ ...formContacto, email: e.target.value })} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" className="boton" onClick={guardarFormContacto} disabled={guardando || !formContacto.nombre.trim()}>
                      {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button type="button" className="boton" onClick={() => setFormContacto(null)} disabled={guardando}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
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
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 0' }}>
          Arrastra una reunión a otro día para reprogramarla (queda en el historial).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 8 }}>
          {DIAS.map((d) => (
            <div key={d} style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', fontWeight: 700 }}>{d}</div>
          ))}
          {celdas.map((f, i) => (
            <div
              key={`${f ?? 'v'}-${i}`}
              onDragOver={(e) => {
                if (f && arrastrandoId) e.preventDefault();
              }}
              onDrop={() => {
                if (f && arrastrandoId) moverA(arrastrandoId, f);
                setArrastrandoId(null);
              }}
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
                      draggable
                      onDragStart={() => setArrastrandoId(e.id)}
                      onDragEnd={() => setArrastrandoId(null)}
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
