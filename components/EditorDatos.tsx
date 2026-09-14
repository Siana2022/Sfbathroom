'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ColMeta = {
  columna: string;
  tipo: string;
  not_null: boolean;
  es_pk: boolean;
  es_generado: boolean;
  ref_tabla: string | null;
};

type Props = {
  tablas: { tabla: string; titulo: string }[];
  empresaId: string;
  empresaNombre: string;
};

const AUTOGENERADAS = new Set(['id', 'created_at', 'updated_at']);

function inputTypeDe(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes('bool')) return 'checkbox';
  if (t.includes('timestamp')) return 'datetime-local';
  if (t.includes('date')) return 'date';
  if (t.includes('int')) return 'number';
  if (t.includes('numeric') || t.includes('real') || t.includes('double')) return 'number';
  return 'text';
}

function labelDe(fila: Record<string, unknown>): string {
  for (const clave of ['nombre', 'numero_erp', 'codigo_erp', 'email', 'titulo', 'descripcion', 'kpi', 'partida', 'canal', 'referencia']) {
    const v = fila[clave];
    if (v !== null && v !== undefined && v !== '') return String(v);
  }
  return fila.id ? String(fila.id).slice(0, 8) : '—';
}

export default function EditorDatos({ tablas, empresaId, empresaNombre }: Props) {
  const supabase = createClient();
  const [tablaSel, setTablaSel] = useState(tablas[0]?.tabla ?? '');
  const [columnas, setColumnas] = useState<ColMeta[]>([]);
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok?: boolean; texto: string } | null>(null);
  const [nueva, setNueva] = useState(false);
  const [editar, setEditar] = useState<Record<string, unknown> | null>(null);
  const [valores, setValores] = useState<Record<string, string | boolean>>({});
  const [opcionesFk, setOpcionesFk] = useState<Record<string, { id: string; label: string }[]>>({});

  const soloEscritura = useMemo(
    () => columnas.filter((c) => !AUTOGENERADAS.has(c.columna) && !c.es_generado),
    [columnas]
  );

  const cargar = useCallback(
    async (tabla: string) => {
      setCargando(true);
      setMensaje(null);
      setNueva(false);
      setEditar(null);
      setValores({});
      setOpcionesFk({});

      const { data: cols, error: errCols } = await supabase.rpc('admin_columnas_tabla', { p_tabla: tabla });
      if (errCols) {
        setMensaje({ texto: `No se pudieron cargar las columnas: ${errCols.message}` });
        setCargando(false);
        return;
      }
      setColumnas((cols ?? []) as ColMeta[]);

      const { data: filas0, error: errFilas } = await supabase.from(tabla).select('*').limit(200);
      if (errFilas) {
        setMensaje({ texto: `No se pudieron cargar los datos: ${errFilas.message}` });
      } else {
        setFilas((filas0 ?? []) as Record<string, unknown>[]);
      }

      for (const c of (cols ?? []) as ColMeta[]) {
        if (c.ref_tabla && c.tipo.includes('uuid') && !c.es_pk) {
          const { data: ref } = await supabase.from(c.ref_tabla).select('*').limit(300);
          setOpcionesFk((prev) => ({
            ...prev,
            [c.columna]: ((ref ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), label: labelDe(r) })),
          }));
        }
      }

      setCargando(false);
    },
    [supabase]
  );

  useEffect(() => {
    if (tablaSel) void cargar(tablaSel);
  }, [tablaSel, cargar]);

  function valorActual(c: ColMeta, row: Record<string, unknown>): string | boolean {
    const v = row[c.columna];
    if (c.tipo.toLowerCase().includes('bool')) return Boolean(v);
    if (v === null || v === undefined) return '';
    if (c.tipo.toLowerCase().includes('timestamp')) {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return '';
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    return String(v);
  }

  function abrirNueva() {
    setEditar(null);
    setNueva(true);
    const inicial: Record<string, string | boolean> = {};
    for (const c of soloEscritura) {
      if (c.columna === 'empresa_id') inicial[c.columna] = empresaId;
      else if (c.tipo.toLowerCase().includes('bool')) inicial[c.columna] = false;
      else inicial[c.columna] = '';
    }
    setValores(inicial);
  }

  function abrirEditar(row: Record<string, unknown>) {
    setNueva(false);
    setEditar(row);
    const inicial: Record<string, string | boolean> = {};
    for (const c of soloEscritura) inicial[c.columna] = valorActual(c, row);
    setValores(inicial);
  }

  function coerce(val: string | boolean, tipo: string): unknown {
    const t = tipo.toLowerCase();
    if (t.includes('bool')) return val === true || val === 'true';
    if (val === '') return null;
    if (t.includes('int')) {
      const n = Number(val);
      return Number.isNaN(n) ? null : n;
    }
    if (t.includes('numeric') || t.includes('real') || t.includes('double')) {
      const n = Number(val);
      return Number.isNaN(n) ? null : n;
    }
    if (t.includes('timestamp')) return String(val).includes('T') ? new Date(String(val)).toISOString() : val;
    if (t.includes('jsonb')) {
      try {
        return JSON.parse(String(val));
      } catch {
        return val;
      }
    }
    return val;
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const payload: Record<string, unknown> = {};
    for (const c of soloEscritura) {
      if (c.columna === 'id') continue;
      const v = valores[c.columna];
      payload[c.columna] = coerce(v, c.tipo);
    }
    if (nueva) {
      const { error } = await supabase.from(tablaSel).insert(payload);
      if (error) setMensaje({ texto: `Error al insertar: ${error.message}` });
      else {
        setMensaje({ ok: true, texto: 'Registro creado.' });
        setNueva(false);
        void cargar(tablaSel);
      }
    } else if (editar) {
      const primaria = columnas.find((c) => c.es_pk)?.columna ?? 'id';
      const { error } = await supabase.from(tablaSel).update(payload).eq(primaria, editar[primaria]);
      if (error) setMensaje({ texto: `Error al guardar: ${error.message}` });
      else {
        setMensaje({ ok: true, texto: 'Registro actualizado.' });
        setEditar(null);
        void cargar(tablaSel);
      }
    }
  }

  async function borrar(row: Record<string, unknown>) {
    const primaria = columnas.find((c) => c.es_pk)?.columna ?? 'id';
    const label = labelDe(row);
    if (!window.confirm(`¿Borrar "${label}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from(tablaSel).delete().eq(primaria, row[primaria]);
    if (error) setMensaje({ texto: `Error al borrar: ${error.message}` });
    else {
      setMensaje({ ok: true, texto: 'Registro borrado.' });
      void cargar(tablaSel);
    }
  }

  const tablaTitulo = tablas.find((t) => t.tabla === tablaSel)?.titulo ?? tablaSel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Tabla</label>
        <select value={tablaSel} onChange={(e) => setTablaSel(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--borde, #333)', background: 'var(--card-bg)', color: 'inherit', minWidth: 280 }}>
          {tablas.map((t) => (
            <option key={t.tabla} value={t.tabla}>{t.titulo}</option>
          ))}
        </select>
        <span style={{ marginLeft: 12, color: 'var(--muted)', fontSize: '0.85rem' }}>
          Empresa activa: {empresaNombre}. {cargando ? 'Cargando…' : `${filas.length} registros (máx. 200).`}
        </span>
      </div>

      {mensaje ? (
        <p className="nota" style={mensaje.ok ? undefined : { color: 'var(--error, darkred)' }}>
          {mensaje.texto}
        </p>
      ) : null}

      {/* Formulario alta/edición */}
      {(nueva || editar) && (
        <div className="card">
          <h2>{nueva ? `Nueva fila en ${tablaTitulo}` : `Editar ${tablaTitulo}`}</h2>
          <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {soloEscritura.map((c) => {
              const esFk = c.ref_tabla && opcionesFk[c.columna];
              return (
                <label key={c.columna} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                  <span>
                    {c.columna}
                    {c.not_null ? <span style={{ color: 'var(--error, darkred)' }}> *</span> : null}
                    {esFk ? <span style={{ color: 'var(--muted)' }}> (→{c.ref_tabla})</span> : null}
                  </span>
                  {c.tipo.toLowerCase().includes('bool') ? (
                    <input
                      type="checkbox"
                      checked={Boolean(valores[c.columna])}
                      onChange={(e) => setValores((prev) => ({ ...prev, [c.columna]: e.target.checked }))}
                    />
                  ) : esFk ? (
                    <select
                      value={String(valores[c.columna] ?? '')}
                      onChange={(e) => setValores((prev) => ({ ...prev, [c.columna]: e.target.value }))}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--borde, #333)', background: 'var(--card-bg)', color: 'inherit' }}
                    >
                      <option value="">—</option>
                      {(opcionesFk[c.columna] ?? []).map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={inputTypeDe(c.tipo)}
                      step="any"
                      value={String(valores[c.columna] ?? '')}
                      onChange={(e) => setValores((prev) => ({ ...prev, [c.columna]: e.target.value }))}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--borde, #333)', background: 'var(--card-bg)', color: 'inherit' }}
                    />
                  )}
                </label>
              );
            })}
            <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
              <button className="boton" type="submit" disabled={cargando}>
                {nueva ? 'Crear registro' : 'Guardar cambios'}
              </button>
              <button
                className="boton"
                type="button"
                onClick={() => {
                  setNueva(false);
                  setEditar(null);
                }}
                style={{ backgroundColor: 'transparent' }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{tablaTitulo}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="boton" onClick={abrirNueva}>+ Nueva fila</button>
            <button className="boton" onClick={() => void cargar(tablaSel)} style={{ backgroundColor: 'transparent' }}>
              Recargar
            </button>
          </div>
        </div>
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                {columnas.map((c) => (
                  <th key={c.columna} className="td-num">{c.columna}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={columnas.length + 2} className="td-num">Sin registros.</td>
                </tr>
              ) : (
                filas.map((f, i) => (
                  <tr key={String(f.id ?? i)}>
                    <td className="td-num">{i + 1}</td>
                    {columnas.map((c) => {
                      let v = f[c.columna] as unknown;
                      if (v === null || v === undefined) v = '';
                      if (c.tipo.toLowerCase().includes('timestamp') && v) {
                        v = String(v).slice(0, 10);
                      } else if (c.tipo.toLowerCase().includes('bool')) {
                        v = v ? '✓' : '';
                      } else if (typeof v === 'number') {
                        v = v.toLocaleString('es-ES');
                      } else if (typeof v === 'object') {
                        v = JSON.stringify(v);
                      }
                      return (
                        <td key={c.columna} className="td-num" title={c.tipo}>
                          {String(v)}
                        </td>
                      );
                    })}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="boton" onClick={() => abrirEditar(f)} style={{ backgroundColor: 'transparent', padding: '2px 8px', marginRight: 4 }}>
                        Editar
                      </button>
                      <button className="boton" onClick={() => void borrar(f)} style={{ backgroundColor: 'transparent', padding: '2px 8px', color: 'var(--error, darkred)' }}>
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}