import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';

export type TesoreriaData = {
  empresaId: string;
  saldoTotal: number;
  vencido: number;
  enCartera: number;
  pisos: { inicio: string; etiqueta: string; importe: number; facturas: number }[]; // próximas 8 semanas
  proximas: { factura: string | null; cliente: string; fechaVencimiento: string; importe: number }[];
};

const DIA = 86400000;

/**
 * Proyección de tesorería: la factura vence en su fecha pactada; si ya pasó, hoy es lo que
 * está pendiente de cobro. Agrupa las próximas 8 semanas (rango ISO) por importe pendiente.
 */
export async function getTesoreria(codigoEmpresa: string): Promise<TesoreriaData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);

  const { data: aging } = await supabase
    .from('v_aging')
    .select('factura_id, numero_erp, cliente_id, pendiente, dias_mora')
    .eq('empresa_id', empresa.id);
  const filas = (aging ?? []) as { factura_id: string; numero_erp: string | null; cliente_id: string | null; pendiente: number; dias_mora: number }[];

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hoyDias = Math.floor(hoy.getTime() / DIA);

  let saldoTotal = 0;
  let vencido = 0;
  let enCartera = 0;

  const detalle: { factura: string | null; clienteId: string | null; vencimiento: number; importe: number }[] = [];
  for (const f of filas) {
    const p = Number(f.pendiente ?? 0);
    if (p <= 0) continue;
    saldoTotal += p;
    const vcmDias = hoyDias - f.dias_mora; // fecha vencimiento en días
    if (vcmDias < hoyDias) vencido += p;
    else enCartera += p;
    detalle.push({ factura: f.numero_erp, clienteId: f.cliente_id, vencimiento: vcmDias, importe: p });
  }

  // pisos: semanas ISO de hoy en adelante
  const inicioDias = (hoyDias - ((hoy.getDay() + 6) % 7)); // lunes de esta semana
  const pisos: TesoreriaData['pisos'] = [];
  for (let s = 0; s < 8; s++) {
    const lunes = inicioDias + s * 7;
    const domingo = lunes + 6;
    const importe = detalle.filter((d) => d.vencimiento >= lunes && d.vencimiento <= domingo).reduce((a, d) => a + d.importe, 0);
    const nF = detalle.filter((d) => d.vencimiento >= lunes && d.vencimiento <= domingo).length;
    const inicio = new Date(lunes * DIA).toISOString().slice(0, 10);
    pisos.push({ inicio, etiqueta: `Sem ${new Date(lunes * DIA).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`, importe, facturas: nF });
  }

  // próximas facturas (vencimiento hoy o futuro), 10 primeras
  const clientesDig = await supabase.from('clientes').select('id, nombre').eq('empresa_id', empresa.id);
  const nombreCliente = new Map((clientesDig.data ?? [] as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]));
  const proximas = detalle
    .filter((d) => d.vencimiento >= hoyDias)
    .sort((a, b) => a.vencimiento - b.vencimiento)
    .slice(0, 10)
    .map((d) => ({
      factura: d.factura,
      cliente: nombreCliente.get(d.clienteId ?? '') ?? '—',
      fechaVencimiento: new Date(d.vencimiento * DIA).toISOString().slice(0, 10),
      importe: d.importe,
    }));

  return { empresaId: empresa.id, saldoTotal, vencido, enCartera, pisos, proximas };
}