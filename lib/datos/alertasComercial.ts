import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getUsuario } from '@/lib/datos/role';
import { todasLasFilas, TAMANO_PAGINA } from '@/lib/datos/query';

export type AlertaComercial = {
  tipo: string;
  clave: string;
  categoria: 'clientes' | 'cobros' | 'pedidos' | 'agenda' | 'objetivo';
  severidad: 'critico' | 'aviso';
  titulo: string;
  detalle: string;
  enlace: string;
  /** Comercial al que pertenece la alerta (para el envío individual por job). */
  comercialId?: string | null;
  /** Empresa de la alerta (la vista fusionada mezcla las tres). */
  empresaId?: string | null;
  empresaCodigo?: string | null;
};

export type AlertasComercialData = {
  esComercial: boolean;
  empresaId: string;
  comercialId: string | null;
  alertas: AlertaComercial[];
  criticas: number;
  avisos: number;
};

const DIA = 86400000;
const UMBRAL_SIN_COMPRAR = 90;
const UMBRAL_SIN_COMPRAR_AVISO = 60;
const UMBRAL_CAIDA = 60;
const UMBRAL_MORA = 2000;
const UMBRAL_MORA_CRITICO = 10000;
const UMBRAL_LIMITE = 90;
const UMBRAL_NUEVO_DIAS = 45;
const UMBRAL_OBJETIVO = 0.8;

export type ContextoAlertas = {
  /** uuid de la empresa. */
  empresaId: string;
  /** código de empresa (S…), necesario para el RPC de cobros. */
  codigoEmpresa: string;
  /** Comerciales a analizar. */
  comercialIds: string[];
  anio: number;
  /** Fecha de referencia en formato YYYY-MM-DD. */
  hoy: string;
};

/**
 * Cálculo de alertas de cartera para uno o varios comerciales.
 *
 * No usa la sesión: recibe el cliente de Supabase (de sesión o service_role) y los
 * comercial_ids explícitos. Todas las consultas filtran por esos ids, así que el
 * resultado es el mismo con RLS que con service_role, sin depender de `auth.uid()`.
 */
export async function calcularAlertasComercial(
  supabase: SupabaseClient,
  ctx: ContextoAlertas,
): Promise<AlertaComercial[]> {
  const { empresaId, codigoEmpresa, comercialIds, anio } = ctx;
  const hoyISO = ctx.hoy;
  const hoyMs = Date.parse(`${hoyISO}T00:00:00Z`);
  if (comercialIds.length === 0) return [];

  const anioPrev = anio - 1;

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('id, nombre, limite_credito, comercial_id')
    .eq('empresa_id', empresaId)
    .in('comercial_id', comercialIds);
  const clientes = (clientesRaw ?? []) as {
    id: string;
    nombre: string;
    limite_credito: number | null;
    comercial_id: string | null;
  }[];
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) return [];

  // Se traen las facturas de la empresa y se filtran en memoria por los clientes de
  // estos comerciales: con toda la plantilla a la vez, un `.in('cliente_id', …)` con
  // cientos de UUIDs supera el tamaño máximo de URL de PostgREST.
  const idsCliente = new Set(ids);
  const facturas = await todasLasFilas<{ cliente_id: string | null; fecha: string; base_imponible: number; tipo_documento: string }>(
    (desde) =>
      supabase
        .from('facturas')
        .select('cliente_id, fecha, base_imponible, tipo_documento')
        .eq('empresa_id', empresaId)
        .gte('fecha', `${anioPrev}-01-01`)
        .range(desde, desde + TAMANO_PAGINA - 1),
  );

  const netaAnio = new Map<string, number>();
  const netaPrev = new Map<string, number>();
  const ultima = new Map<string, string>();
  const facturasAnio = new Map<string, number>();
  for (const f of facturas) {
    if (!f.cliente_id || !idsCliente.has(f.cliente_id)) continue;
    const signo = f.tipo_documento === 'abono' ? -1 : 1;
    const importe = signo * Math.abs(Number(f.base_imponible ?? 0));
    if (f.fecha.slice(0, 4) === String(anio)) {
      netaAnio.set(f.cliente_id, (netaAnio.get(f.cliente_id) ?? 0) + importe);
      if (f.tipo_documento !== 'abono') facturasAnio.set(f.cliente_id, (facturasAnio.get(f.cliente_id) ?? 0) + 1);
    } else {
      netaPrev.set(f.cliente_id, (netaPrev.get(f.cliente_id) ?? 0) + importe);
    }
    const prev = ultima.get(f.cliente_id);
    if (!prev || f.fecha > prev) ultima.set(f.cliente_id, f.fecha);
  }

  const { data: resumen } = await supabase.rpc('cobros_resumen', {
    p_codigo_empresa: codigoEmpresa,
    p_cliente: null,
  });
  const porClienteCobros = new Map<string, { saldo: number; vencido: number }>();
  for (const c of ((resumen as { por_cliente?: { cliente_id: string; saldo: number; vencido: number }[] } | null)?.por_cliente ?? [])) {
    porClienteCobros.set(c.cliente_id, { saldo: Number(c.saldo ?? 0), vencido: Number(c.vencido ?? 0) });
  }

  const alertas: AlertaComercial[] = [];

  for (const c of clientes) {
    const comercialId = c.comercial_id ?? null;
    const ultimaFecha = ultima.get(c.id);
    const dias = ultimaFecha ? Math.floor((hoyMs - Date.parse(`${ultimaFecha.slice(0, 10)}T00:00:00Z`)) / DIA) : 999;

    if (dias >= UMBRAL_SIN_COMPRAR) {
      alertas.push({
        tipo: 'sin_comprar',
        categoria: 'clientes',
        clave: '',
        severidad: 'critico',
        titulo: `${c.nombre} lleva ${dias === 999 ? 'sin compras registradas' : `${dias} días sin comprar`}`,
        detalle: ultimaFecha ? `Última compra: ${ultimaFecha}` : 'Sin facturas en el histórico consultado',
        enlace: `/clientes/${c.id}`,
        comercialId,
      });
    } else if (dias >= UMBRAL_SIN_COMPRAR_AVISO) {
      alertas.push({
        tipo: 'sin_comprar_aviso',
        categoria: 'clientes',
        clave: '',
        severidad: 'aviso',
        titulo: `${c.nombre} lleva ${dias} días sin comprar`,
        detalle: `Última compra: ${ultimaFecha}`,
        enlace: `/clientes/${c.id}`,
        comercialId,
      });
    }

    const nA = netaAnio.get(c.id) ?? 0;
    const nP = netaPrev.get(c.id) ?? 0;
    if (nP > 0 && nA < nP * (UMBRAL_CAIDA / 100)) {
      alertas.push({
        tipo: 'caida',
        categoria: 'clientes',
        clave: '',
        severidad: 'aviso',
        titulo: `${c.nombre} cae un ${Math.round((1 - nA / nP) * 100)} %`,
        detalle: `${Math.round(nA)} € este año frente a ${Math.round(nP)} € el anterior`,
        enlace: `/clientes/${c.id}`,
        comercialId,
      });
    }

    const cobros = porClienteCobros.get(c.id);
    if (cobros && cobros.vencido > 0) {
      if (cobros.vencido >= UMBRAL_MORA_CRITICO) {
        alertas.push({
          tipo: 'mora',
          categoria: 'cobros',
          clave: '',
          severidad: 'critico',
          titulo: `${c.nombre} debe ${Math.round(cobros.vencido)} € vencidos`,
          detalle: 'Mora elevada: revisar cobro antes de seguir sirviendo',
          enlace: '/credito-cobro',
          comercialId,
        });
      } else if (cobros.vencido >= UMBRAL_MORA) {
        alertas.push({
          tipo: 'mora',
          categoria: 'cobros',
          clave: '',
          severidad: 'aviso',
          titulo: `${c.nombre} tiene ${Math.round(cobros.vencido)} € vencidos`,
          detalle: 'Mora pendiente de cobro',
          enlace: '/credito-cobro',
          comercialId,
        });
      }
    }

    if (c.limite_credito && c.limite_credito > 0 && cobros) {
      const uso = (cobros.saldo / c.limite_credito) * 100;
      if (uso >= UMBRAL_LIMITE) {
        alertas.push({
          tipo: 'limite',
          categoria: 'cobros',
          clave: '',
          severidad: uso >= 100 ? 'critico' : 'aviso',
          titulo: `${c.nombre} usa el ${Math.round(uso)} % de su límite`,
          detalle: `Saldo ${Math.round(cobros.saldo)} € de ${Math.round(c.limite_credito)} €`,
          enlace: `/clientes/${c.id}`,
          comercialId,
        });
      }
    }

    if ((facturasAnio.get(c.id) ?? 0) === 1 && dias > UMBRAL_NUEVO_DIAS) {
      alertas.push({
        tipo: 'nuevo_sin_recompra',
        categoria: 'clientes',
        clave: '',
        severidad: 'aviso',
        titulo: `${c.nombre} solo ha comprado una vez`,
        detalle: 'Cliente nuevo sin segunda compra: oportunidad de seguimiento',
        enlace: `/clientes/${c.id}`,
        comercialId,
      });
    }
  }

  const { data: pedidosRaw } = await supabase
    .from('pedidos')
    .select('id, numero_erp, cliente_id, fecha_prometida, importe, comercial_id')
    .eq('empresa_id', empresaId)
    .in('comercial_id', comercialIds)
    .eq('estado', 'pendiente');
  for (const p of (pedidosRaw ?? []) as {
    id: string;
    numero_erp: string | null;
    cliente_id: string | null;
    fecha_prometida: string | null;
    importe: number;
    comercial_id: string | null;
  }[]) {
    if (p.fecha_prometida && p.fecha_prometida.slice(0, 10) < hoyISO) {
      const cli = clientes.find((c) => c.id === p.cliente_id);
      alertas.push({
        tipo: 'pedido_atrasado',
        categoria: 'pedidos',
        clave: '',
        severidad: 'critico',
        titulo: `Pedido ${p.numero_erp ?? ''} con entrega pasada`,
        detalle: `${cli?.nombre ?? 'Cliente'} · prometido ${p.fecha_prometida} · ${Math.round(Number(p.importe ?? 0))} €`,
        enlace: '/pedidos',
        comercialId: p.comercial_id,
      });
    }
  }

  const { data: agendaRaw } = await supabase
    .from('agenda')
    .select('id, asunto, fecha, cliente_id, comercial_id')
    .eq('empresa_id', empresaId)
    .eq('estado', 'programada')
    .lt('fecha', hoyISO);
  for (const a of (agendaRaw ?? []) as {
    id: string;
    asunto: string;
    fecha: string;
    cliente_id: string | null;
    comercial_id: string | null;
  }[]) {
    // La agenda puede tener reuniones sin comercial (creadas por dirección):
    // se mantienen visibles para todos los comerciales, como con RLS.
    if (a.comercial_id && !comercialIds.includes(a.comercial_id)) continue;
    alertas.push({
      tipo: 'reunion_atrasada',
      categoria: 'agenda',
      clave: '',
      severidad: 'aviso',
      titulo: `Reunión atrasada: ${a.asunto}`,
      detalle: `Programada para ${a.fecha}`,
      enlace: `/agenda/${a.id}`,
      comercialId: a.comercial_id,
    });
  }

  const { data: objetivoFilas } = await supabase
    .from('objetivos_comercial')
    .select('comercial_id, importe')
    .eq('empresa_id', empresaId)
    .eq('anio', anio)
    .in('comercial_id', comercialIds);
  const objetivoPorComercial = new Map<string, number>();
  for (const o of (objetivoFilas ?? []) as { comercial_id: string; importe: number }[]) {
    objetivoPorComercial.set(o.comercial_id, Number(o.importe ?? 0));
  }
  if (objetivoPorComercial.size > 0) {
    // Neta del año por comercial (a partir de sus clientes) para comparar con su objetivo.
    const netaPorComercial = new Map<string, number>();
    for (const c of clientes) {
      if (!c.comercial_id) continue;
      netaPorComercial.set(c.comercial_id, (netaPorComercial.get(c.comercial_id) ?? 0) + (netaAnio.get(c.id) ?? 0));
    }
    const diaDelAnio = Math.floor((hoyMs - Date.parse(`${anio}-01-01T00:00:00Z`)) / DIA) + 1;
    for (const comercialId of comercialIds) {
      const objetivo = objetivoPorComercial.get(comercialId) ?? 0;
      if (objetivo <= 0) continue;
      const neta = netaPorComercial.get(comercialId) ?? 0;
      const esperado = objetivo * (diaDelAnio / 365);
      if (neta < esperado * UMBRAL_OBJETIVO) {
        alertas.push({
          tipo: 'objetivo',
          categoria: 'objetivo',
          clave: '',
          severidad: 'aviso',
          titulo: 'Ritmo por debajo del objetivo',
          detalle: `${Math.round(neta)} € frente a ${Math.round(esperado)} € esperados a estas alturas`,
          enlace: '/',
          comercialId,
        });
      }
    }
  }

  // Clave estable por alerta (tipo + cliente/pedido/reunión) y silenciados.
  for (const a of alertas) {
    if (!a.clave) a.clave = `${a.tipo}:${a.enlace}`;
  }
  const { data: silenciadas } = await supabase
    .from('alertas_silenciadas')
    .select('clave')
    .eq('empresa_id', empresaId);
  const ocultas = new Set(((silenciadas ?? []) as { clave: string }[]).map((s) => s.clave));
  const visibles = alertas.filter((a) => !ocultas.has(a.clave));

  const orden = { critico: 0, aviso: 1 } as const;
  for (const a of visibles) {
    a.empresaId = empresaId;
    a.empresaCodigo = codigoEmpresa;
  }
  visibles.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
  return visibles;
}

/**
 * Alertas del comercial autenticado (página `/alertas-comercial`).
 * Resuelve el usuario y su cartera y delega en `calcularAlertasComercial`.
 */
export async function getAlertasComercial(codigoEmpresa: string): Promise<AlertasComercialData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const usuario = await getUsuario();
  const esComercial = usuario?.rol === 'comercial';

  const vacio = (comercialId: string | null): AlertasComercialData => ({
    esComercial,
    empresaId: empresa.id,
    comercialId,
    alertas: [],
    criticas: 0,
    avisos: 0,
  });

  if (!usuario) return vacio(null);
  const comercialIds = usuario.comercialIds;
  const comercialId = usuario.comercialId;
  if (esComercial && comercialIds.length === 0) return vacio(comercialId);
  if (comercialIds.length === 0) return vacio(comercialId);

  const hoy = new Date();
  const alertas = await calcularAlertasComercial(supabase, {
    empresaId: empresa.id,
    codigoEmpresa,
    comercialIds,
    anio: hoy.getFullYear(),
    hoy: hoy.toISOString().slice(0, 10),
  });

  return {
    esComercial,
    empresaId: empresa.id,
    comercialId,
    alertas,
    criticas: alertas.filter((a) => a.severidad === 'critico').length,
    avisos: alertas.filter((a) => a.severidad === 'aviso').length,
  };
}


/**
 * Alertas del comercial con la cartera de las tres empresas en una sola lista.
 * Mismo cálculo, una pasada por empresa; cada alerta lleva su empresa para poder
 * silenciarla en la correcta.
 */
export async function getAlertasComercialTodas(): Promise<{
  alertas: AlertaComercial[];
  criticas: number;
  avisos: number;
}> {
  const supabase = createClient();
  const usuario = await getUsuario();
  if (!usuario || usuario.comercialIds.length === 0) {
    return { alertas: [], criticas: 0, avisos: 0 };
  }

  const { EMPRESAS } = await import('@/lib/empresas');
  const hoy = new Date();
  const contexto = {
    comercialIds: usuario.comercialIds,
    anio: hoy.getFullYear(),
    hoy: hoy.toISOString().slice(0, 10),
  };

  const listas = await Promise.all(
    EMPRESAS.map(async (e) => {
      const empresa = await getEmpresaPorCodigo(e.codigo);
      return calcularAlertasComercial(supabase, { ...contexto, empresaId: empresa.id, codigoEmpresa: e.codigo });
    }),
  );

  const orden = { critico: 0, aviso: 1 } as const;
  const alertas = listas.flat().sort((a, b) => orden[a.severidad] - orden[b.severidad]);
  return {
    alertas,
    criticas: alertas.filter((a) => a.severidad === 'critico').length,
    avisos: alertas.filter((a) => a.severidad === 'aviso').length,
  };
}
