'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { EventoAgenda } from '@/lib/datos/agenda';

const TIPOS_SEGUIMIENTO: { valor: string; etiqueta: string }[] = [
  { valor: 'pedido_solicitado', etiqueta: 'Pedido solicitado' },
  { valor: 'reunion_seguimiento', etiqueta: 'Reunión de seguimiento' },
  { valor: 'otros', etiqueta: 'Otros' },
];

const TIPOS_REUNION: Record<string, string> = {
  presencial: 'Presencial',
  online: 'Online',
  telefonica: 'Telefónica',
  email: 'Email',
};

const ESTADOS: Record<string, string> = {
  programada: 'Programada',
  realizada: 'Realizada',
  ganada: 'Cerrada · ganada',
  perdida: 'Cerrada · perdida',
  cancelada: 'Cancelada',
};

const RESULTADOS: { valor: string; etiqueta: string }[] = [
  { valor: 'ganada', etiqueta: 'Cerrada / ganada' },
  { valor: 'pedido', etiqueta: 'Pedido solicitado' },
  { valor: 'seguimiento', etiqueta: 'Requiere seguimiento' },
  { valor: 'perdida', etiqueta: 'Cerrada / perdida' },
  { valor: 'cancelada', etiqueta: 'Cancelada / no asistió' },
];

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
  const [error, setError] = useState<string | null>(null);

  const [nota, setNota] = useState('');
  const [tipoSeguimiento, setTipoSeguimiento] = useState('reunion_seguimiento');
  const [motivo, setMotivo] = useState('');

  const [fechaNueva, setFechaNueva] = useState(evento.fecha);
  const [horaNueva, setHoraNueva] = useState(evento.hora ? evento.hora.slice(0, 5) : '');

  const [subiendo, setSubiendo] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [resultado, setResultado] = useState('ganada');
  const [importe, setImporte] = useState(evento.importeEstimado !== null ? String(evento.importeEstimado) : '');
  const [pedidoRef, setPedidoRef] = useState(evento.pedidoRef ?? '');
  const [motivoCierre, setMotivoCierre] = useState(evento.motivoCierre ?? '');
  const [proxFecha, setProxFecha] = useState(evento.fecha);
  const [proxHora, setProxHora] = useState('');
  const [proxAsunto, setProxAsunto] = useState(`Seguimiento: ${evento.asunto}`);

  const finalizada = evento.estado !== 'programada';

  async function añadirNota() {
    if (!nota.trim()) return;
    setError(null);
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda_notas').insert({
        agenda_id: evento.id,
        empresa_id: empresaId,
        comercial_id: comercialId,
        texto: nota.trim(),
        tipo: tipoSeguimiento,
        motivo: tipoSeguimiento === 'otros' ? motivo.trim() || null : null,
      });
      if (e) setError(e.message);
      else {
        setNota('');
        setMotivo('');
        setTipoSeguimiento('reunion_seguimiento');
        router.refresh();
      }
    });
  }

  async function reagendar() {
    if (!fechaNueva) return;
    const antes = `${evento.fecha}${evento.hora ? ` ${evento.hora.slice(0, 5)}` : ''}`;
    const despues = `${fechaNueva}${horaNueva ? ` ${horaNueva}` : ''}`;
    const { error: e } = await supabase
      .from('agenda')
      .update({ fecha: fechaNueva, hora: horaNueva || null })
      .eq('id', evento.id);
    if (e) {
      setError(e.message);
      return;
    }
    await supabase.from('agenda_notas').insert({
      agenda_id: evento.id,
      empresa_id: empresaId,
      comercial_id: comercialId,
      texto: `Reagendada: ${antes} → ${despues}`,
      tipo: 'sistema',
    });
    router.refresh();
  }

  async function finalizar() {
    setError(null);
    let estado = 'realizada';
    let texto = 'Reunión finalizada.';
    let nuevaReunionId: string | null = null;

    if (resultado === 'ganada' || resultado === 'pedido') {
      estado = 'ganada';
      texto =
        resultado === 'pedido'
          ? `Resultado: pedido solicitado${importe ? ` · ${importe} €` : ''}${pedidoRef ? ` · pedido ${pedidoRef}` : ''}`
          : `Resultado: cerrada/ganada${importe ? ` · ${importe} €` : ''}${pedidoRef ? ` · pedido ${pedidoRef}` : ''}`;
    } else if (resultado === 'perdida') {
      estado = 'perdida';
      texto = `Resultado: cerrada/perdida${motivoCierre ? ` · ${motivoCierre}` : ''}`;
    } else if (resultado === 'cancelada') {
      estado = 'cancelada';
      texto = 'Reunión cancelada / no asistió.';
    } else if (resultado === 'seguimiento') {
      estado = 'realizada';
      if (!proxFecha) {
        setError('Indica la fecha de la próxima reunión.');
        return;
      }
      const { data: creada, error: eCrear } = await supabase
        .from('agenda')
        .insert({
          empresa_id: empresaId,
          comercial_id: comercialId,
          cliente_id: evento.clienteId,
          fecha: proxFecha,
          hora: proxHora || null,
          asunto: proxAsunto.trim() || `Seguimiento: ${evento.asunto}`,
          tipo: evento.tipo,
          estado: 'programada',
        })
        .select('id')
        .single();
      if (eCrear) {
        setError(eCrear.message);
        return;
      }
      nuevaReunionId = (creada as { id: string }).id;
      texto = `Requiere seguimiento · próxima reunión ${proxFecha}${proxHora ? ` ${proxHora}` : ''}`;
    }

    let pedidoId: string | null = null;
    if (pedidoRef.trim()) {
      const { data: ped } = await supabase
        .from('pedidos')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('numero_erp', pedidoRef.trim())
        .maybeSingle();
      pedidoId = (ped as { id: string } | null)?.id ?? null;
    }

    const { error: e } = await supabase
      .from('agenda')
      .update({
        estado,
        completada: true,
        importe_estimado: resultado === 'ganada' || resultado === 'pedido' ? Number(importe) || null : null,
        pedido_ref: pedidoRef.trim() || null,
        pedido_id: pedidoId,
        motivo_cierre: resultado === 'perdida' ? motivoCierre.trim() || null : null,
        proxima_reunion_id: nuevaReunionId,
      })
      .eq('id', evento.id);
    if (e) {
      setError(e.message);
      return;
    }
    await supabase.from('agenda_notas').insert({
      agenda_id: evento.id,
      empresa_id: empresaId,
      comercial_id: comercialId,
      texto,
      tipo: 'sistema',
    });
    setFinalizando(false);
    router.refresh();
  }

  async function reabrir() {
    const { error: e } = await supabase
      .from('agenda')
      .update({ estado: 'programada', completada: false, proxima_reunion_id: null })
      .eq('id', evento.id);
    if (e) {
      setError(e.message);
      return;
    }
    await supabase.from('agenda_notas').insert({
      agenda_id: evento.id,
      empresa_id: empresaId,
      comercial_id: comercialId,
      texto: 'Reunión reabierta.',
      tipo: 'sistema',
    });
    router.refresh();
  }

  async function subirArchivo(file: File) {
    setError(null);
    setSubiendo(true);
    const limpio = file.name.replace(/[^\w.\-]+/g, '_');
    const ruta = `${evento.id}/${Date.now()}-${limpio}`;
    const { error: e } = await supabase.storage.from('agenda-adjuntos').upload(ruta, file, { upsert: false });
    setSubiendo(false);
    if (e) {
      setError(e.message);
      return;
    }
    router.refresh();
  }

  async function borrarArchivo(nombre: string) {
    if (!window.confirm('¿Eliminar este adjunto?')) return;
    const { error: e } = await supabase.storage.from('agenda-adjuntos').remove([`${evento.id}/${nombre}`]);
    if (e) setError(e.message);
    else router.refresh();
  }

  async function borrar() {
    if (!window.confirm('¿Borrar esta reunión y todo su seguimiento? No se puede deshacer.')) return;
    startTransition(async () => {
      const { error: e } = await supabase.from('agenda').delete().eq('id', evento.id);
      if (e) setError(e.message);
      else router.push('/agenda');
    });
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
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
            {evento.contacto?.nombre ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Contacto: {evento.contacto.nombre}
                {evento.contacto.telefono ? ` · ${evento.contacto.telefono}` : ''}
                {evento.contacto.email ? ` · ${evento.contacto.email}` : ''}
              </div>
            ) : evento.clienteContacto ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {evento.clienteContacto.persona ?? ''}
                {evento.clienteContacto.telefono ? ` · ${evento.clienteContacto.telefono}` : ''}
                {evento.clienteContacto.email ? ` · ${evento.clienteContacto.email}` : ''}
              </div>
            ) : null}
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Tipo</div>
            <strong>{TIPOS_REUNION[evento.tipo] ?? evento.tipo}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Estado</div>
            <strong>{ESTADOS[evento.estado] ?? evento.estado}</strong>
          </div>
          {evento.importeEstimado !== null ? (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Importe</div>
              <strong>{evento.importeEstimado} €</strong>
            </div>
          ) : null}
          {evento.pedidoRef ? (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Pedido</div>
              <strong>{evento.pedidoRef}</strong>
              {evento.pedido ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  vinculado · {evento.pedido.importe.toFixed(2)} €
                  {evento.importeEstimado !== null && Math.abs(evento.pedido.importe - evento.importeEstimado) > 0.01
                    ? ' (no coincide con el importe estimado)'
                    : ''}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--rojo)' }}>no encontrado en pedidos</div>
              )}
            </div>
          ) : null}
        </div>

        {evento.notas ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Notas iniciales</div>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{evento.notas}</p>
          </div>
        ) : null}

        {evento.motivoCierre ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Motivo de cierre</div>
            <p style={{ margin: 0 }}>{evento.motivoCierre}</p>
          </div>
        ) : null}

        {!finalizada ? (
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
              <button type="button" className="boton" onClick={reagendar} disabled={pending || !fechaNueva}>
                Reagendar
              </button>
              <button type="button" className="boton" onClick={() => setFinalizando((v) => !v)}>
                {finalizando ? 'Cancelar cierre' : 'Finalizar reunión'}
              </button>
            </div>
          </div>
        ) : null}

        {finalizando && !finalizada ? (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--wash)', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 8px' }}>Resultado de la reunión</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="campo-filtro">
                Resultado
                <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
                  {RESULTADOS.map((r) => (
                    <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                  ))}
                </select>
              </label>
              {(resultado === 'ganada' || resultado === 'pedido') ? (
                <>
                  <label className="campo-filtro">
                    Importe (€)
                    <input type="number" min={0} step={0.01} value={importe} onChange={(e) => setImporte(e.target.value)} />
                  </label>
                  <label className="campo-filtro">
                    Nº pedido
                    <input type="text" value={pedidoRef} onChange={(e) => setPedidoRef(e.target.value)} />
                  </label>
                </>
              ) : null}
              {resultado === 'perdida' ? (
                <label className="campo-filtro" style={{ flex: 1, minWidth: 220 }}>
                  Motivo
                  <input type="text" value={motivoCierre} onChange={(e) => setMotivoCierre(e.target.value)} placeholder="Precio, competencia, timing…" />
                </label>
              ) : null}
              {resultado === 'seguimiento' ? (
                <>
                  <label className="campo-filtro">
                    Próxima fecha *
                    <input type="date" value={proxFecha} onChange={(e) => setProxFecha(e.target.value)} />
                  </label>
                  <label className="campo-filtro">
                    Hora
                    <input type="time" value={proxHora} onChange={(e) => setProxHora(e.target.value)} />
                  </label>
                  <label className="campo-filtro" style={{ flex: 1, minWidth: 220 }}>
                    Asunto
                    <input type="text" value={proxAsunto} onChange={(e) => setProxAsunto(e.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
            {error ? <p className="nota" style={{ color: 'var(--rojo)' }}>{error}</p> : null}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="boton" onClick={finalizar} disabled={pending}>
                Guardar resultado
              </button>
            </div>
          </div>
        ) : null}

        {finalizada ? (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="boton" onClick={reabrir} disabled={pending}>Reabrir reunión</button>
            <button type="button" className="boton" onClick={borrar} disabled={pending}>Borrar reunión</button>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Adjuntos y actas</h2>
        {evento.adjuntos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin adjuntos.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {evento.adjuntos.map((a) => (
              <li key={a.nombre} style={{ marginBottom: 6 }}>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="enlace">{a.nombre}</a>
                ) : (
                  a.nombre
                )}{' '}
                <button type="button" className="boton" onClick={() => borrarArchivo(a.nombre)} disabled={pending}>
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 10 }}>
          <label className="boton" style={{ cursor: 'pointer', display: 'inline-block' }}>
            {subiendo ? 'Subiendo…' : 'Subir archivo'}
            <input
              type="file"
              style={{ display: 'none' }}
              disabled={subiendo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) subirArchivo(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Seguimiento completo</h2>
        {evento.seguimiento.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin seguimiento todavía.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {evento.seguimiento.map((n) => (
              <li key={n.id} style={{ marginBottom: 12 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {n.fecha.slice(0, 16).replace('T', ' ')} ·{' '}
                  {n.tipo === 'sistema'
                    ? 'Sistema'
                    : (TIPOS_SEGUIMIENTO.find((tp) => tp.valor === n.tipo)?.etiqueta ?? n.tipo)}
                  {n.tipo === 'otros' && n.motivo ? `: ${n.motivo}` : ''}
                </span>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <label className="campo-filtro">
            Tipo de seguimiento
            <select value={tipoSeguimiento} onChange={(e) => setTipoSeguimiento(e.target.value)}>
              {TIPOS_SEGUIMIENTO.map((tp) => (
                <option key={tp.valor} value={tp.valor}>{tp.etiqueta}</option>
              ))}
            </select>
          </label>
          {tipoSeguimiento === 'otros' ? (
            <label className="campo-filtro" style={{ flex: 1, minWidth: 220 }}>
              Motivo
              <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la reunión" />
            </label>
          ) : null}
        </div>

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
          {!finalizada ? (
            <button type="button" className="boton" onClick={borrar} disabled={pending}>
              Borrar reunión
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
