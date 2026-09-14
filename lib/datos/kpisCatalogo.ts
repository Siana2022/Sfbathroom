/** Catálogo whitelist — solo estas claves son válidas. Sin SQL libre, sin expresiones. */

export const METRICAS = {
  ventas_netas:   { etiqueta: 'Ventas netas',          calculosValidos: ['suma','yoy','pct_total'],           formatoDefault: 'euro' },
  unidades:       { etiqueta: 'Unidades',              calculosValidos: ['suma','yoy','pct_total'],           formatoDefault: 'numero' },
  margen_pct:     { etiqueta: 'Margen (%)',            calculosValidos: ['media_ponderada','yoy'],            formatoDefault: 'pct' },
  margen_abs:     { etiqueta: 'Margen (€)',            calculosValidos: ['suma','yoy','pct_total'],           formatoDefault: 'euro' },
  num_clientes:   { etiqueta: 'Nº de clientes',        calculosValidos: ['suma','conteo','yoy','pct_total'],   formatoDefault: 'numero' },
  ticket_medio:   { etiqueta: 'Ticket medio',          calculosValidos: ['media','yoy','pct_total'],          formatoDefault: 'euro' },
  dso:            { etiqueta: 'DSO (días)',            calculosValidos: ['suma'],                             formatoDefault: 'dias' },
  pct_devoluciones: { etiqueta: '% devoluciones',      calculosValidos: ['media','pct_total'],                formatoDefault: 'pct' },
  cumplimiento:   { etiqueta: 'Cumplimiento presupuesto', calculosValidos: ['suma'],                          formatoDefault: 'pct' },
} as const;

export type MetricaClave = keyof typeof METRICAS;

export const CALCULOS = {
  suma:             'Suma',
  media:            'Media',
  media_ponderada:  'Media ponderada',
  conteo:           'Conteo',
  yoy:              'Crecimiento YoY',
  pct_total:        '% del total',
} as const;

export const DIMENSIONES = [
  { clave: 'familia_id',    etiqueta: 'Familia' },
  { clave: 'comercial_id',  etiqueta: 'Comercial' },
  { clave: 'canal_id',      etiqueta: 'Canal' },
  { clave: 'cliente_id',    etiqueta: 'Cliente' },
  { clave: 'marca_id',      etiqueta: 'Marca' },
  { clave: 'pais',          etiqueta: 'País' },
  { clave: 'fecha_desde',   etiqueta: 'Desde' },
  { clave: 'fecha_hasta',   etiqueta: 'Hasta' },
  { clave: 'ejercicio',     etiqueta: 'Ejercicio' },
] as const;

export type DimensionClave = typeof DIMENSIONES[number]['clave'];

export const FORMATOS = {
  euro:   { etiqueta: '€',  fmt: (v: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) },
  pct:    { etiqueta: '%',  fmt: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + ' %' },
  numero: { etiqueta: '#',  fmt: (v: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v) },
  dias:   { etiqueta: 'd',  fmt: (v: number) => v.toFixed(1) + ' días' },
} as const;

export type FormatoClave = keyof typeof FORMATOS;

export type KpiConfig = {
  id?: string;
  nombre: string;
  metrica: MetricaClave;
  calculo: string;
  filtros: Partial<Record<DimensionClave, string>>;
  objetivo?: number | null;
  objetivo_op?: 'gte' | 'lte';
  formato: FormatoClave;
  visible_para?: string;
  propietario?: string;
  orden?: number;
};

export function validarConfig(cfg: Partial<KpiConfig>): string | null {
  if (!cfg.nombre?.trim()) return 'El nombre es obligatorio.';
  const metrica = cfg.metrica as MetricaClave | undefined;
  if (!metrica || !(metrica in METRICAS)) return `Métrica no válida: ${cfg.metrica}`;
  const metricaDef = METRICAS[metrica];
  if (!cfg.calculo || !metricaDef.calculosValidos.includes(cfg.calculo as never)) {
    return `Cálculo no válido para ${metricaDef.etiqueta}: ${cfg.calculo}. Válidos: ${metricaDef.calculosValidos.join(', ')}`;
  }
  const dimInvalida = Object.keys(cfg.filtros ?? {}).find((k) => !DIMENSIONES.some((d) => d.clave === k));
  if (dimInvalida) return `Dimensión de filtro no válida: ${dimInvalida}`;
  if (cfg.formato && !(cfg.formato in FORMATOS)) return `Formato no válido: ${cfg.formato}`;
  return null;
}
