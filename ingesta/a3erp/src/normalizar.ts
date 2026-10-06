import { randomUUID } from 'node:crypto';
import { a3 } from './config.js';

export type DocumentoNormalizado = {
  id: string;
  numero_erp: string;
  empresa_codigo: string;
  fecha: string;
  tipo_documento: string;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  comercial_codigo: string | null;
  comercial_nombre: string | null;
  base_imponible: number | null;
  total: number | null;
  portes: number;
  descuento_pie: number;
  rappel_devengado: number;
  albaran_numero: string | null;
  factura_anula_numero: string | null;
};

export type LineaNormalizada = {
  id: string;
  factura_numero_erp: string;
  articulo_codigo: string | null;
  articulo_nombre: string | null;
  cantidad: number;
  precio_unitario: number;
  coste_unitario: number | null;
  descuento_pct: number;
};

const col = (fila: Record<string, unknown>, campo: string): unknown => {
  const nombre = a3.columnas[campo];
  return nombre === undefined ? undefined : fila[nombre];
};

function numeroCompuesto(fila: Record<string, unknown>): string | null {
  const nro = texto(col(fila, 'numero_erp'));
  if (!nro) return null;
  const serie = texto(col(fila, 'serie'));
  return serie ? `${serie}-${nro}` : nro;
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fechaISO(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (s === '') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return s;
}

function tipoNormalizado(v: unknown): string {
  const raw = texto(v) ?? '';
  const paraClave = a3.tiposDocumento[raw];
  if (paraClave) return paraClave;
  const baja = raw.toLowerCase();
  if (baja.includes('abon')) return 'abono';
  if (baja.includes('cargo')) return 'nota_cargo';
  return 'factura';
}

function abono(tipo: string): boolean {
  return tipo === 'abono';
}

export function normalizarRows(filas: Record<string, unknown>[], empresaCodigo: string): { documentos: DocumentoNormalizado[]; lineas: LineaNormalizada[] } {
  const porDoc = new Map<string, DocumentoNormalizado>();

  for (const f of filas) {
    const numero = numeroCompuesto(f);
    if (!numero) continue;

    let doc = porDoc.get(numero);
    if (!doc) {
      const tipo = tipoNormalizado(col(f, 'tipo_documento'));
      const total = aNumero(col(f, 'total'));
      const base = aNumero(col(f, 'base_imponible'));
      const signo = abono(tipo) ? -1 : 1;
      doc = {
        id: randomUUID(),
        numero_erp: numero,
        empresa_codigo: empresaCodigo,
        fecha: fechaISO(col(f, 'fecha')) ?? '',
        tipo_documento: tipo,
        cliente_codigo: texto(col(f, 'cliente_codigo')),
        cliente_nombre: texto(col(f, 'cliente_nombre')),
        comercial_codigo: texto(col(f, 'comercial_codigo')),
        comercial_nombre: texto(col(f, 'comercial_nombre')),
        base_imponible: base === null ? null : Math.abs(base) * signo,
        total: total === null ? null : Math.abs(total) * signo,
        portes: abono(tipo) ? -Math.abs(aNumero(col(f, 'portes')) ?? 0) : Math.abs(aNumero(col(f, 'portes')) ?? 0),
        descuento_pie: abono(tipo) ? -Math.abs(aNumero(col(f, 'descuento_pie')) ?? 0) : Math.abs(aNumero(col(f, 'descuento_pie')) ?? 0),
        rappel_devengado: abono(tipo) ? -Math.abs(aNumero(col(f, 'rappel_devengado')) ?? 0) : Math.abs(aNumero(col(f, 'rappel_devengado')) ?? 0),
        albaran_numero: texto(col(f, 'albaran_numero')),
        factura_anula_numero: texto(col(f, 'factura_anula_numero')),
      };
      porDoc.set(numero, doc);
    }
  }

  const lineas: LineaNormalizada[] = [];
  for (const f of filas) {
    const numero = numeroCompuesto(f);
    const cantidad = aNumero(col(f, 'cantidad'));
    if (!numero || cantidad === null) continue;
    const articulo = texto(col(f, 'articulo_codigo'));
    const precio = aNumero(col(f, 'precio_unitario'));
    if (!articulo || precio === null) continue;
    lineas.push({
      id: randomUUID(),
      factura_numero_erp: numero,
      articulo_codigo: articulo,
      articulo_nombre: texto(col(f, 'articulo_nombre')),
      cantidad,
      precio_unitario: precio,
      coste_unitario: aNumero(col(f, 'coste_unitario')),
      descuento_pct: Math.abs(aNumero(col(f, 'descuento_pct')) ?? 0),
    });
  }

  return { documentos: [...porDoc.values()], lineas };
}