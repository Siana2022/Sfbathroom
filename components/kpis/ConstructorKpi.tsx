'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CALCULOS, DIMENSIONES, FORMATOS, METRICAS, type KpiConfig, type MetricaClave } from '@/lib/datos/kpisCatalogo';

type Props = {
  empresa: string;
  onGuardar?: () => void;
  editable?: Partial<KpiConfig> | null;
};

type EtiquetaSelect = { valor: string; etiqueta: string };

export default function ConstructorKpi({ empresa, onGuardar, editable }: Props) {
  const [nombre, setNombre] = useState(editable?.nombre ?? '');
  const [metrica, setMetrica] = useState<MetricaClave>((editable?.metrica as MetricaClave) ?? 'ventas_netas');
  const [calculo, setCalculo] = useState(editable?.calculo ?? 'suma');
  const [filtros, setFiltros] = useState<Record<string, string>>((editable?.filtros as Record<string, string>) ?? {});
  const [dimensionPendiente, setDimensionPendiente] = useState('');
  const [objetivo, setObjetivo] = useState<string>(editable?.objetivo != null ? String(editable.objetivo) : '');
  const [objetivoOp, setObjetivoOp] = useState<'gte' | 'lte'>(editable?.objetivo_op ?? 'gte');
  const [formato, setFormato] = useState<keyof typeof FORMATOS>((editable?.formato as keyof typeof FORMATOS) ?? 'numero');
  const [visible, setVisible] = useState(editable?.visible_para ?? 'direccion');
  const [preview, setPreview] = useState<{ valor: number | null; formato: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nombreOk = nombre.trim().length > 0;
  const calculosValidos = useMemo(() => METRICAS[metrica].calculosValidos as readonly string[], [metrica]);

  useEffect(() => {
    if (!calculosValidos.includes(calculo)) {
      setCalculo(calculosValidos[0] ?? 'suma');
      setFormato(METRICAS[metrica].formatoDefault as keyof typeof FORMATOS);
    }
  }, [metrica, calculosValidos, calculo]);

  const cfgActual: KpiConfig = useMemo(() => ({
    nombre,
    metrica,
    calculo,
    filtros,
    objetivo: objetivo ? Number(objetivo) : null,
    objetivo_op: objetivoOp,
    formato,
    visible_para: visible,
  }), [nombre, metrica, calculo, filtros, objetivo, objetivoOp, formato, visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/kpis/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cfg: cfgActual, empresa }),
        });
        const data = await res.json();
        if (res.ok) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data.error ?? 'Error'); }
      } catch {
        setPreview(null); setPreviewError('Error de conexión');
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cfgActual, empresa]);

  function añadirDimension() {
    if (!dimensionPendiente) return;
    const valor = prompt(`Valor para ${DIMENSIONES.find((d) => d.clave === dimensionPendiente)?.etiqueta}:`);
    if (valor != null) {
      setFiltros((f) => ({ ...f, [dimensionPendiente]: valor }));
    }
    setDimensionPendiente('');
  }

  function quitarDimension(clave: string) {
    setFiltros((f) => {
      const copia = { ...f };
      delete copia[clave];
      return copia;
    });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!nombreOk) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cfg: cfgActual, empresa }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'No se pudo guardar.'); return; }
      onGuardar?.();
    } finally {
      setGuardando(false);
    }
  }

  const fmtPreview = (v: number | null) => {
    if (v == null) return '—';
    const f = FORMATOS[formato] ?? FORMATOS.numero;
    return f.fmt(v);
  };

  const filtroPendiente = dimensionPendiente
    ? DIMENSIONES.find((d) => d.clave === dimensionPendiente)
    : null;

  return (
    <form onSubmit={guardar} className="card" style={{ maxWidth: 820 }}>
      <h2 style={{ marginTop: 0 }}>{editable ? 'Editar KPI' : 'Nuevo KPI personalizado'}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        <label className="campo-filtro">
          <span>Nombre del KPI</span>
          <input type="text" className="input-dato" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="p. ej. Ventas canal mayorista" />
        </label>

        <label className="campo-filtro">
          <span>Métrica</span>
          <select className="input-dato" value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaClave)}>
            {Object.entries(METRICAS).map(([clave, def]) => (
              <option key={clave} value={clave}>{def.etiqueta}</option>
            ))}
          </select>
        </label>

        <label className="campo-filtro">
          <span>Cálculo</span>
          <select className="input-dato" value={calculo} onChange={(e) => setCalculo(e.target.value)}>
            {calculosValidos.map((c) => (
              <option key={c} value={c}>{CALCULOS[c as keyof typeof CALCULOS] ?? c}</option>
            ))}
          </select>
        </label>

        <label className="campo-filtro">
          <span>Formato</span>
          <select className="input-dato" value={formato} onChange={(e) => setFormato(e.target.value as keyof typeof FORMATOS)}>
            {Object.entries(FORMATOS).map(([k, def]) => (
              <option key={k} value={k}>{def.etiqueta}</option>
            ))}
          </select>
        </label>

        <label className="campo-filtro">
          <span>Visible para</span>
          <select className="input-dato" value={visible} onChange={(e) => setVisible(e.target.value)}>
            <option value="direccion">Dirección / Admin</option>
            <option value="todos">Todos los roles</option>
            <option value="propietario">Solo yo</option>
          </select>
        </label>

        <label className="campo-filtro">
          <span>Objetivo ({objetivoOp})</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="input-dato" value={objetivoOp} onChange={(e) => setObjetivoOp(e.target.value as 'gte' | 'lte')} style={{ flex: 1 }}>
              <option value="gte">≥</option>
              <option value="lte">≤</option>
            </select>
            <input type="number" step="any" className="input-dato" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
              placeholder="valor" style={{ flex: 2 }} />
          </div>
        </label>
      </div>

      <div style={{ marginTop: 14 }}>
        <span style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>Filtros</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input-dato" value={dimensionPendiente} onChange={(e) => setDimensionPendiente(e.target.value)}>
            <option value="">Añadir filtro…</option>
            {DIMENSIONES.filter((d) => !(d.clave in filtros)).map((d) => (
              <option key={d.clave} value={d.clave}>{d.etiqueta}</option>
            ))}
          </select>
          <button type="button" className="boton" onClick={añadirDimension} disabled={!dimensionPendiente}>Añadir</button>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {Object.entries(filtros).map(([clave, valor]) => (
            <span key={clave} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {DIMENSIONES.find((d) => d.clave === clave)?.etiqueta}: {valor || '—'}
              <button type="button" onClick={() => quitarDimension(clave)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, fontSize: 12 }} aria-label={`Quitar ${clave}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="submit" className="boton" disabled={!nombreOk || guardando}>
          {guardando ? 'Guardando…' : editable ? 'Guardar cambios' : 'Guardar KPI'}
        </button>
      </div>

      <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700 }}>Vista previa</span>
        <div className="grid-kpis" style={{ marginTop: 8 }}>
          <li className="kpi">
            <span className="kpi-etiqueta">{nombre || 'KPI sin nombre'}</span>
            <strong className="kpi-valor">
              {preview ? fmtPreview(preview.valor) : previewError ? '—' : '…'}
            </strong>
            <span className="kpi-nota">
              {previewError ?? (objetivo ? `${objetivoOp === 'gte' ? 'Objetivo ≥' : 'Objetivo ≤'} ${fmtPreview(Number(objetivo))}` : ' ')}
            </span>
          </li>
        </div>
      </div>
    </form>
  );
}