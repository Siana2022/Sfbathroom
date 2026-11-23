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

export async function getAlertasComercial(codigoEmpresa: string): Promise<AlertasComercialData> {
  const supabase = createClient();
  const empresa = await getEmpresaPorCodigo(codigoEmpresa);
  const usuario = await getUsuario();
  const esComercial = usuario?.rol === 'comercial';
  if (!usuario) {
    return { esComercial: false, empresaId: empresa.id, comercialId: null, alertas: [], criticas: 0, avisos: 0 };
  }

  const hoy = new Date();
  const hoyISO = hoy.toISOString().slice(0, 10);
  const anio = hoy.getFullYear();
  const anioPrev = anio - 1;

  const comercialIds = usuario.comercialIds;
  let comercialId: string | null = usuario.comercialId;
  if (esComercial && comercialIds.length === 0) {
    return { esComercial, empresaId: empresa.id, comercialId, alertas: [], criticas: 0, avisos: 0 };
  }

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('id, nombre, limite_credito')
    .eq('empresa_id', empresa.id)
    .in('comercial_id', comercialIds);
  const clientes = (clientesRaw ?? []) as { id: string; nombre: string; limite_credito: number | null }[];
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) {
    return { esComercial, empresaId: empresa.id, comercialId, alertas: [], criticas: 0, avisos: 0 };
  }

  const facturas = await todasLasFilas<{ cliente_id: string | null; fecha: string; base_imponible: number; tipo_documento: string }>(
    (desde) =>
      supabase
        .from('facturas')
        .select('cliente_id, fecha, base_imponible, tipo_documento')
        .eq('empresa_id', empresa.id)
        .in('cliente_id', ids)
        .gte('fecha', `${anioPrev}-01-01`)
        .range(desde, desde + TAMANO_PAGINA - 1),
  );

  const netaAnio = new Map<string, number>();
  const netaPrev = new Map<string, number>();
  const ultima = new Map<string, string>();
  const facturasAnio = new Map<string, number>();
  for (const f of facturas) {
    if (!f.cliente_id) continue;
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
  const hoyMs = Date.now();

  for (const c of clientes) {
    const ultimaFecha = ultima.get(c.id);
    const dias = ultimaFecha ? Math.floor((hoyMs - Date.parse(ultimaFecha)) / DIA) : 999;

    if (dias >= UMBRAL_SIN_COMPRAR) {
      alertas.push({
        tipo: 'sin_comprar',
        categoria: 'clientes',
        clave: '' ,
        severidad: 'critico',
        titulo: `${c.nombre} lleva ${dias === 999 ? 'sin compras registradas' : `${dias} días sin comprar`}`,
        detalle: ultimaFecha ? `Última compra: ${ultimaFecha}` : 'Sin facturas en el histórico consultado',
        enlace: `/clientes/${c.id}`,
      });
    } else if (dias >= UMBRAL_SIN_COMPRAR_AVISO) {
      alertas.push({
        tipo: 'sin_comprar_aviso',
        categoria: 'clientes',
        clave: '' ,
        severidad: 'aviso',
        titulo: `${c.nombre} lleva ${dias} días sin comprar`,
        detalle: `Última compra: ${ultimaFecha}`,
        enlace: `/clientes/${c.id}`,
      });
    }

    const nA = netaAnio.get(c.id) ?? 0;
    const nP = netaPrev.get(c.id) ?? 0;
    if (nP > 0 && nA < nP * (UMBRAL_CAIDA / 100)) {
      alertas.push({
        tipo: 'caida',
        categoria: 'clientes',
        clave: '' ,
        severidad: 'aviso',
        titulo: `${c.nombre} cae un ${Math.round((1 - nA / nP) * 100)} %`,
        detalle: `${Math.round(nA)} € este año frente a ${Math.round(nP)} € el anterior`,
        enlace: `/clientes/${c.id}`,
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
        });
      }
    }

    if (c.limite_credito && c.limite_credito > 0 && cobros) {
      const uso = (cobros.saldo / c.limite_credito) * 100;
      if (uso >= 90) {
        alertas.push({
          tipo: 'limite',
          categoria: 'cobros',
          clave: '',
          severidad: uso >= 100 ? 'critico' : 'aviso',
          titulo: `${c.nombre} usa el ${Math.round(uso)} % de su límite`,
          detalle: `Saldo ${Math.round(cobros.saldo)} € de ${Math.round(c.limite_credito)} €`,
          enlace: `/clientes/${c.id}`,
        });
      }
    }

    if ((facturasAnio.get(c.id) ?? 0) === 1 && dias > 45) {
      alertas.push({
        tipo: 'nuevo_sin_recompra',
        categoria: 'clientes',
        clave: '' ,
        severidad: 'aviso',
        titulo: `${c.nombre} solo ha comprado una vez`,
        detalle: 'Cliente nuevo sin segunda compra: oportunidad de seguimiento',
        enlace: `/clientes/${c.id}`,
      });
    }
  }

  const { data: pedidosRaw } = await supabase
    .from('pedidos')
    .select('id, numero_erp, cliente_id, fecha_prometida, importe')
    .eq('empresa_id', empresa.id)
    .in('comercial_id', comercialIds)
    .eq('estado', 'pendiente');
  for (const p of (pedidosRaw ?? []) as { id: string; numero_erp: string | null; cliente_id: string | null; fecha_prometida: string | null; importe: number }[]) {
    if (p.fecha_prometida && p.fecha_prometida < hoyISO) {
      const cli = clientes.find((c) => c.id === p.cliente_id);
      alertas.push({
        tipo: 'pedido_atrasado',
        categoria: 'pedidos',
        clave: '',
        severidad: 'critico',
        titulo: `Pedido ${p.numero_erp ?? ''} con entrega pasada`,
        detalle: `${cli?.nombre ?? 'Cliente'} · prometido ${p.fecha_prometida} · ${Math.round(Number(p.importe ?? 0))} €`,
        enlace: '/pedidos',
      });
    }
  }

  const { data: agendaRaw } = await supabase
    .from('agenda')
    .select('id, asunto, fecha, cliente_id')
    .eq('empresa_id', empresa.id)
    .eq('estado', 'programada')
    .lt('fecha', hoyISO);
  for (const a of (agendaRaw ?? []) as { id: string; asunto: string; fecha: string; cliente_id: string | null }[]) {
    alertas.push({
      tipo: 'reunion_atrasada',
        categoria: 'agenda',
      clave: '',
      severidad: 'aviso',
      titulo: `Reunión atrasada: ${a.asunto}`,
      detalle: `Programada para ${a.fecha}`,
      enlace: `/agenda/${a.id}`,
    });
  }

  const { data: objetivoFilas } = await supabase
    .from('objetivos_comercial')
    .select('importe')
    .eq('empresa_id', empresa.id)
    .eq('anio', anio)
    .in('comercial_id', comercialIds);
  const objetivo = ((objetivoFilas ?? []) as { importe: number }[]).reduce(
    (s, o) => s + Number(o.importe ?? 0),
    0,
  );
  if (objetivo > 0) {
    const netaTotal = [...netaAnio.values()].reduce((s, v) => s + v, 0);
    const diaDelAnio = Math.floor((hoy.getTime() - Date.parse(`${anio}-01-01`)) / DIA) + 1;
    const esperado = objetivo * (diaDelAnio / 365);
    if (netaTotal < esperado * 0.8) {
      alertas.push({
        tipo: 'objetivo',
        categoria: 'objetivo',
        clave: '',
        severidad: 'aviso',
        titulo: 'Ritmo por debajo del objetivo',
        detalle: `${Math.round(netaTotal)} € frente a ${Math.round(esperado)} € esperados a estas alturas`,
        enlace: '/',
      });
    }
  }

  // Clave estable por alerta (tipo + cliente/pedido/reunión) y silenciados.
  for (const a of alertas) {
    if (!a.clave) a.clave = `${a.tipo}:${a.enlace}`;
  }
  const { data: silenciadas } = await supabase
    .from('alertas_silenciadas')
    .select('clave')
    .eq('empresa_id', empresa.id);
  const ocultas = new Set(((silenciadas ?? []) as { clave: string }[]).map((s) => s.clave));
  const visibles = alertas.filter((a) => !ocultas.has(a.clave));

  const orden = { critico: 0, aviso: 1 } as const;
  visibles.sort((a, b) => orden[a.severidad] - orden[b.severidad]);

  return {
    esComercial,
    empresaId: empresa.id,
    comercialId,
    alertas: visibles,
    criticas: visibles.filter((a) => a.severidad === 'critico').length,
    avisos: visibles.filter((a) => a.severidad === 'aviso').length,
  };
}
