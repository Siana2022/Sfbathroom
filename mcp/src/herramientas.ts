import { z } from 'zod';
import { supabase } from './entorno.js';
import { r2, inTroceado, empresaDe, DatosError } from './consulta.js';

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

type FilaFactura = { id: string; fecha: string; tipo_documento: string; total: number; cliente_id: string | null };
type Signo = (tipo: string) => number;

const signo: Signo = (tipo) => (tipo === 'abono' ? -1 : 1);

function texto(datos: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(datos, null, 2) }] };
}

export function esquemas() {
  return {
    empresa: z.string().describe('Código de empresa: SF, DOT, FUX…'),
    ejercicio: z.number().int().describe('Año, ej. 2026'),
    mes: z.number().int().min(1).max(12).optional(),
    limite: z.number().int().min(1).max(100).optional(),
  } as const;
}

export const herramientas = {
  listar_empresas: {
    descripcion: 'Lista las empresas del sistema con su código y nombre.',
    schema: {},
    async ejecutar(_args: {}) {
      const { data, error } = await supabase.from('empresas').select('id, codigo, nombre').order('codigo');
      if (error) throw new DatosError(`Error listando empresas: ${error.message}`);
      return texto((data ?? []).map((e) => ({ codigo: e.codigo, nombre: e.nombre })));
    },
  },

  ventas_por_mes: {
    descripcion: 'Neta mensual del ejercicio (facturas + notas de cargo - abonos), unidades y nº de documentos.',
    schema: { empresa: z.string(), ejercicio: z.number().int() },
    async ejecutar(args: { empresa: string; ejercicio: number }) {
      const empresaId = await empresaDe(args.empresa);
      const { data, error } = await supabase
        .from('facturas')
        .select('id, fecha, tipo_documento, total')
        .eq('empresa_id', empresaId)
        .gte('fecha', `${args.ejercicio}-01-01`)
        .lte('fecha', `${args.ejercicio}-12-31`);
      if (error) throw new DatosError(`Error consultando facturas: ${error.message}`);
      const docs = (data ?? []) as FilaFactura[];

      const porMes = new Map<number, { neta: number; documentos: number; abonosYNotas: number }>();
      const idsDeFactura = new Map<string, number>();
      const idsFactura: string[] = [];
      for (const f of docs) {
        const m = Number(f.fecha.slice(5, 7));
        const cur = porMes.get(m) ?? { neta: 0, documentos: 0, abonosYNotas: 0 };
        cur.neta += Number(f.total ?? 0);
        if (f.tipo_documento === 'factura') {
          cur.documentos += 1;
          idsFactura.push(f.id);
          idsDeFactura.set(f.id, m);
        } else cur.abonosYNotas += 1;
        porMes.set(m, cur);
      }

      const unidadesPorMes = new Map<number, number>();
      if (idsFactura.length) {
        const lineas = await inTroceado<{ factura_id: string; cantidad: number }>(
          'factura_lineas',
          'factura_id',
          idsFactura,
          'factura_id, cantidad',
        );
        for (const l of lineas) {
          const m = idsDeFactura.get(l.factura_id);
          if (m) unidadesPorMes.set(m, (unidadesPorMes.get(m) ?? 0) + Number(l.cantidad ?? 0));
        }
      }

      const totalNeta = docs.reduce((a, f) => a + Number(f.total ?? 0), 0);
      const series = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const c = porMes.get(m) ?? { neta: 0, documentos: 0, abonosYNotas: 0 };
        return { mes: m, mes_nombre: MESES[m], neta: r2(c.neta), unidades: r2(unidadesPorMes.get(m) ?? 0), documentos: c.documentos, abonos_y_notas: c.abonosYNotas };
      });
      return texto({ ejercicio: args.ejercicio, total_neta: r2(totalNeta), por_mes: series });
    },
  },

  evolucion_anual: {
    descripcion: 'Neta acumulada a un mes del ejercicio frente al mismo periodo del año anterior.',
    schema: { empresa: z.string(), ejercicio: z.number().int(), mes: z.number().int().min(1).max(12).optional() },
    async ejecutar(args: { empresa: string; ejercicio: number; mes?: number }) {
      const empresaId = await empresaDe(args.empresa);
      const mes = args.mes ?? 12;
      const fin = `${String(mes).padStart(2, '0')}-${String(new Date(args.ejercicio, mes, 0).getDate()).padStart(2, '0')}`;
      const [{ data: cur }, { data: prev }] = await Promise.all([
        supabase.from('facturas').select('total').eq('empresa_id', empresaId).gte('fecha', `${args.ejercicio}-01-01`).lte('fecha', `${args.ejercicio}-${fin}`),
        supabase.from('facturas').select('total').eq('empresa_id', empresaId).gte('fecha', `${args.ejercicio - 1}-01-01`).lte('fecha', `${args.ejercicio - 1}-${fin}`),
      ]);
      if (!cur && !prev) throw new DatosError('Error consultando la evolución.');
      const neta = ((cur ?? []) as FilaFactura[]).reduce((a, f) => a + Number(f.total ?? 0), 0);
      const netaPrevio = ((prev ?? []) as FilaFactura[]).reduce((a, f) => a + Number(f.total ?? 0), 0);
      return texto({
        ejercicio: args.ejercicio,
        previo: args.ejercicio - 1,
        hasta_mes: mes,
        neta: r2(neta),
        neta_previo: r2(netaPrevio),
        delta_pct: netaPrevio > 0 ? r2(((neta - netaPrevio) / netaPrevio) * 100) : null,
      });
    },
  },

  top_clientes: {
    descripcion: 'Clientes de un ejercicio ordenados por neta descendente con peso porcentual.',
    schema: { empresa: z.string(), ejercicio: z.number().int(), limite: z.number().int().min(1).max(100).optional() },
    async ejecutar(args: { empresa: string; ejercicio: number; limite?: number }) {
      const empresaId = await empresaDe(args.empresa);
      const { data, error } = await supabase
        .from('facturas')
        .select('cliente_id, total')
        .eq('empresa_id', empresaId)
        .gte('fecha', `${args.ejercicio}-01-01`)
        .lte('fecha', `${args.ejercicio}-12-31`);
      if (error) throw new DatosError(`Error consultando facturas: ${error.message}`);
      const porCliente = new Map<string, number>();
      for (const f of (data ?? []) as FilaFactura[]) {
        if (!f.cliente_id) continue;
        porCliente.set(f.cliente_id, (porCliente.get(f.cliente_id) ?? 0) + Number(f.total ?? 0));
      }
      const total = [...porCliente.values()].reduce((a, b) => a + b, 0);
      const top = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, args.limite ?? 10);
      const nombres = new Map<string, string>();
      if (top.length) {
        const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', top.map(([id]) => id));
        for (const c of clis ?? []) nombres.set(c.id as string, c.nombre as string);
      }
      return texto({
        ejercicio: args.ejercicio,
        total_neta: r2(total),
        principales: top.map(([id, importe], i) => ({
          posicion: i + 1,
          cliente: nombres.get(id) ?? id,
          importe: r2(importe),
          peso_pct: total > 0 ? r2((importe / total) * 100) : 0,
        })),
      });
    },
  },

  desglose_variacion: {
    descripcion: 'Descompone la variación de neta entre dos ejercicios en efecto precio, volumen, mix y efecto clientes nuevos/perdidos.',
    schema: { empresa: z.string(), ejercicio: z.number().int(), previo: z.number().int().optional() },
    async ejecutar(args: { empresa: string; ejercicio: number; previo?: number }) {
      const empresaId = await empresaDe(args.empresa);
      const previo = args.previo ?? args.ejercicio - 1;
      const { data, error } = await supabase
        .from('facturas')
        .select('id, fecha, tipo_documento, total, cliente_id')
        .eq('empresa_id', empresaId)
        .gte('fecha', `${previo}-01-01`)
        .lte('fecha', `${args.ejercicio}-12-31`);
      if (error) throw new DatosError(`Error consultando facturas: ${error.message}`);
      const docs = (data ?? []) as FilaFactura[];
      const info = new Map<string, { anio: number; tipo: string; cliente: string }>();
      for (const f of docs) info.set(f.id, { anio: Number(f.fecha.slice(0, 4)), tipo: f.tipo_documento, cliente: f.cliente_id ?? '' });

      const lineas = await inTroceado<{ factura_id: string; articulo_id: string; cantidad: number; importe: number }>(
        'factura_lineas',
        'factura_id',
        [...info.keys()],
        'factura_id, articulo_id, cantidad, importe',
      );

      const unidades = new Map<string, [number, number]>();
      const valores = new Map<string, [number, number]>();
      const porCliente = new Map<string, [number, number]>();
      for (const l of lineas) {
        const inf = info.get(l.factura_id);
        if (!inf) continue;
        const idx = inf.anio === args.ejercicio ? 1 : 0;
        const importe = Number(l.importe ?? 0) * signo(inf.tipo);
        if (importe === 0) continue;
        if (l.articulo_id) {
          const u = unidades.get(l.articulo_id) ?? [0, 0];
          if (inf.tipo === 'factura') u[idx] += Number(l.cantidad ?? 0);
          unidades.set(l.articulo_id, u);
          const v = valores.get(l.articulo_id) ?? [0, 0];
          v[idx] += importe;
          valores.set(l.articulo_id, v);
        }
        if (inf.cliente) {
          const c = porCliente.get(inf.cliente) ?? [0, 0];
          c[idx] += importe;
          porCliente.set(inf.cliente, c);
        }
      }

      let delta = 0;
      let precio = 0;
      let restaVolumenMix = 0;
      let uPrev = 0;
      let uAct = 0;
      let vPrev = 0;
      for (const [articulo, vals] of valores) {
        const [v0, v1] = vals;
        const [u0, u1] = unidades.get(articulo) ?? [0, 0];
        const p0 = u0 > 0 ? v0 / u0 : 0;
        const p1 = u1 > 0 ? v1 / u1 : 0;
        delta += v1 - v0;
        precio += (p1 - p0) * u1;
        restaVolumenMix += (u1 - u0) * p0;
        uPrev += u0;
        uAct += u1;
        vPrev += v0;
      }
      const precioMedioPrev = uPrev > 0 ? vPrev / uPrev : 0;
      const volumen = (uAct - uPrev) * precioMedioPrev;
      const mix = restaVolumenMix - volumen;
      const efectoClientes = { nuevos: 0, perdidos: 0, existentes: 0 };
      for (const [prev, act] of porCliente.values()) {
        if (prev === 0 && act !== 0) efectoClientes.nuevos += act;
        else if (act === 0 && prev !== 0) efectoClientes.perdidos -= prev;
        else efectoClientes.existentes += act - prev;
      }
      return texto({ ejercicio: args.ejercicio, previo, delta: r2(delta), precio: r2(precio), volumen: r2(volumen), mix: r2(mix), efecto_clientes: efectoClientes });
    },
  },

  margen_resumen: {
    descripcion: 'Importe vendido, coste de venta, margen y top de familias de un ejercicio.',
    schema: { empresa: z.string(), ejercicio: z.number().int() },
    async ejecutar(args: { empresa: string; ejercicio: number }) {
      const empresaId = await empresaDe(args.empresa);
      const { data: facRes, error } = await supabase
        .from('facturas')
        .select('id, tipo_documento, total')
        .eq('empresa_id', empresaId)
        .in('tipo_documento', ['factura', 'abono', 'nota_cargo'])
        .gte('fecha', `${args.ejercicio}-01-01`)
        .lte('fecha', `${args.ejercicio}-12-31`);
      if (error) throw new DatosError(`Error consultando facturas: ${error.message}`);
      const docs = (facRes ?? []) as FilaFactura[];
      const ids = docs.map((f) => f.id);
      const tipoPorId = new Map<string, string>(docs.map((f) => [f.id, f.tipo_documento]));

      const lineas = ids.length
        ? await inTroceado<{ factura_id: string; articulo_id: string | null; cantidad: number; importe: number; coste_unitario: number }>(
            'factura_lineas',
            'factura_id',
            ids,
            'factura_id, articulo_id, cantidad, importe, coste_unitario',
          )
        : [];
      const { data: artRes } = await supabase.from('articulos').select('id, familia_id, coste_unitario').eq('empresa_id', empresaId);
      const articulos = new Map<string, { familia_id: string | null; coste_unitario: number }>();
      for (const a of artRes ?? []) articulos.set(a.id as string, { familia_id: a.familia_id as string | null, coste_unitario: Number(a.coste_unitario ?? 0) });
      const { data: famRes } = await supabase.from('familias_articulo').select('id, nombre');
      const nombreFamilia = new Map<string, string>();
      for (const f of famRes ?? []) nombreFamilia.set(f.id as string, f.nombre as string);

      let importeVendido = docs.reduce((a, f) => a + Number(f.total ?? 0), 0);
      let costeVenta = 0;
      const familiaResumen = new Map<string, { importe: number; coste: number }>();
      for (const l of lineas) {
        const tipo = tipoPorId.get(l.factura_id);
        if (!tipo) continue;
        const sg = signo(tipo);
        const a = articulos.get(l.articulo_id ?? '');
        const costeUnidad = Number(l.coste_unitario ?? 0) || (a?.coste_unitario ?? 0);
        const importeLinea = Number(l.importe ?? 0) * sg;
        const costeLinea = Number(l.cantidad ?? 0) * costeUnidad * sg;
        costeVenta += costeLinea;
        if (a?.familia_id) {
          const fam = familiaResumen.get(a.familia_id) ?? { importe: 0, coste: 0 };
          fam.importe += importeLinea;
          fam.coste += costeLinea;
          familiaResumen.set(a.familia_id, fam);
        }
      }
      const margen = importeVendido - costeVenta;
      const margenPct = importeVendido > 0 ? (margen / importeVendido) * 100 : null;
      const topFamilias = [...familiaResumen.entries()]
        .map(([id, v]) => ({ familia: nombreFamilia.get(id) ?? id, importe: r2(v.importe), coste: r2(v.coste), margen: r2(v.importe - v.coste) }))
        .sort((a, b) => b.importe - a.importe)
        .slice(0, 8);
      return texto({ ejercicio: args.ejercicio, importe_vendido: r2(importeVendido), coste_venta: r2(costeVenta), margen: r2(margen), margen_pct: margenPct !== null ? r2(margenPct) : null, top_familias: topFamilias });
    },
  },

  stock_resumen: {
    descripcion: 'Unidades totales, nº de referencias con stock, valor a coste y top de artículos.',
    schema: { empresa: z.string() },
    async ejecutar(args: { empresa: string }) {
      const empresaId = await empresaDe(args.empresa);
      const { data: stockRes, error } = await supabase
        .from('stock_actual')
        .select('articulo_id, almacen_id, cantidad');
      if (error) throw new DatosError(`Error consultando stock: ${error.message}`);
      const { data: artRes } = await supabase.from('articulos').select('id, nombre, coste_unitario').eq('empresa_id', empresaId);
      const { data: almRes } = await supabase.from('almacenes').select('id, nombre');
      const articulos = new Map<string, { nombre: string; coste_unitario: number }>();
      for (const a of artRes ?? []) articulos.set(a.id as string, { nombre: a.nombre as string, coste_unitario: Number(a.coste_unitario ?? 0) });
      const nombreAlmacen = new Map<string, string>();
      for (const a of almRes ?? []) nombreAlmacen.set(a.id as string, a.nombre as string);

      const porArticulo = new Map<string, number>();
      const porAlmacen = new Map<string, { unidades: number; valor: number }>();
      for (const s of stockRes ?? []) {
        const cantidad = Number(s.cantidad ?? 0);
        if (cantidad === 0) continue;
        porArticulo.set(s.articulo_id as string, (porArticulo.get(s.articulo_id as string) ?? 0) + cantidad);
        const c = porAlmacen.get(s.almacen_id as string) ?? { unidades: 0, valor: 0 };
        c.unidades += cantidad;
        c.valor += cantidad * (articulos.get(s.articulo_id as string)?.coste_unitario ?? 0);
        porAlmacen.set(s.almacen_id as string, c);
      }
      let valorTotal = 0;
      for (const [id, unidades] of porArticulo) valorTotal += unidades * (articulos.get(id)?.coste_unitario ?? 0);
      const top = [...porArticulo.entries()]
        .map(([id, unidades]) => ({ articulo: articulos.get(id)?.nombre ?? id, unidades: r2(unidades), valor: r2(unidades * (articulos.get(id)?.coste_unitario ?? 0)) }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);
      const almacenes = [...porAlmacen.entries()].map(([id, v]) => ({ almacen: nombreAlmacen.get(id) ?? id, unidades: r2(v.unidades), valor: r2(v.valor) })).filter((a) => a.unidades > 0);
      return texto({
        total_unidades: r2([...porArticulo.values()].reduce((a, b) => a + b, 0)),
        valor_a_coste: r2(valorTotal),
        referencias_con_stock: porArticulo.size,
        top_articulos: top,
        por_almacen: almacenes,
      });
    },
  },

  clientes_impagados: {
    descripcion: 'Saldo en cartera, vencido y total por cliente, ordenado por saldo pendiente.',
    schema: { empresa: z.string() },
    async ejecutar(args: { empresa: string }) {
      const empresaId = await empresaDe(args.empresa);
      const { data, error } = await supabase
        .from('v_saldo_clientes')
        .select('cliente_id, en_cartera, vencido, saldo_total')
        .eq('empresa_id', empresaId)
        .order('saldo_total', { ascending: false });
      if (error) throw new DatosError(`Error consultando saldos (¿vista 0010 aplicada?): ${error.message}`);
      const filas = (data ?? []) as { cliente_id: string; en_cartera: number; vencido: number; saldo_total: number }[];
      const nombres = new Map<string, string>();
      if (filas.length) {
        const { data: clis } = await supabase.from('clientes').select('id, nombre').in('id', filas.map((f) => f.cliente_id));
        for (const c of clis ?? []) nombres.set(c.id as string, c.nombre as string);
      }
      const saldoTotal = filas.reduce((a, f) => a + Number(f.saldo_total ?? 0), 0);
      return texto({
        saldo_total_global: r2(saldoTotal),
        clientes: filas.map((f) => ({
          cliente: nombres.get(f.cliente_id) ?? f.cliente_id,
          en_cartera: r2(Number(f.en_cartera ?? 0)),
          vencido: r2(Number(f.vencido ?? 0)),
          saldo_total: r2(Number(f.saldo_total ?? 0)),
        })),
      });
    },
  },
};

export type RegistroHerramienta = {
  descripcion: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, z.ZodTypeAny>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ejecutar: (args: any) => Promise<{ content: { type: 'text'; text: string }[] }>;
};