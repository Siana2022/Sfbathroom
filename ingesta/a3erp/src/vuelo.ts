import { cfg, a3, empresaInfo, leerArgumentos, hoyISO, menosDias } from './config.js';
import { leerCuboVentas } from './sqlserver.js';
import { normalizarRows } from './normalizar.js';
import { cargarVentas, enlazarFechasPedido, refrescarVistas } from './supabase.js';

type Rango = { desde: string; hasta: string };

function rangoDiario(): Rango {
  const hasta = hoyISO();
  return { desde: menosDias(hasta, cfg.ventanaDias), hasta };
}

function rangoReconciliacion(): Rango {
  return { desde: cfg.periodoStart, hasta: hoyISO() };
}

function construirSQL(base: string, desde: string, hasta: string): string {
  const filtro = a3.sqlVentas.filtroFecha.replace('{desde}', desde).replace('{hasta}', hasta);
  return a3.sqlVentas.consulta.replace('{RANGO}', filtro).replaceAll('{base}', base);
}

function ultimoDiaMes(y: number, m: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function fechaISODe(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function construirSQLFechas(base: string, desde: string, hasta: string): string | null {
  if (!a3.sqlFechasPedido) return null;
  const filtro = a3.sqlFechasPedido.filtroFecha.replace('{desde}', desde).replace('{hasta}', hasta);
  return a3.sqlFechasPedido.consulta.replace('{RANGO}', filtro).replaceAll('{base}', base);
}

/**
 * Guarda en cada factura la fecha del pedido de origen y su entrega comprometida.
 * Es un extra: si falla (migración 0046 sin aplicar), la ingesta de ventas sigue.
 */
async function enlazarFechas(empresa: { codigo: string; base: string }, desde: string, hasta: string): Promise<void> {
  const sql = construirSQLFechas(empresa.base, desde, hasta);
  if (!sql) return;
  const filas = await leerCuboVentas(sql, empresa.base);
  const pares = filas
    .map((f) => ({
      factura_numero: String(f.FACTURA_NUMERO ?? '').trim(),
      factura_numero_alt: String(f.FACTURA_NUMDOC ?? '').trim(),
      pedido_fecha: fechaISODe(f.PEDIDO_FECHA) ?? '',
      pedido_entrega: fechaISODe(f.PEDIDO_ENTREGA) ?? '',
    }))
    .filter((p) => p.factura_numero !== '' && p.pedido_fecha !== '');
  if (pares.length === 0) return;
  const res = await enlazarFechasPedido(empresa.codigo, pares);
  console.log(`[a3erp] fechas pedido→factura: ${pares.length} pares · ${JSON.stringify(res)}`);
}function tramosMensuales(desde: string, hasta: string): Rango[] {
  const tramos: Rango[] = [];
  const [y0, m0] = desde.split('-').slice(0, 2).map(Number);
  const [y1, m1] = hasta.split('-').slice(0, 2).map(Number);
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m++) {
    if (m > 12) {
      m = 1;
      y++;
    }
    const ini = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
    const finMes = ultimoDiaMes(y, m);
    const desdeTramo = y === y0 && m === m0 ? desde : ini;
    const hastaTramo = y === y1 && m === m1 ? hasta : finMes;
    tramos.push({ desde: desdeTramo, hasta: hastaTramo });
  }
  return tramos;
}

async function main(): Promise<void> {
  const args = leerArgumentos(process.argv.slice(2));
  const empresa = empresaInfo(args.empresa ?? cfg.empresaCodigo);
  const rango: Rango = args.desde && args.hasta
    ? { desde: args.desde, hasta: args.hasta }
    : args.modo === 'reconciliacion'
      ? rangoReconciliacion()
      : rangoDiario();

  console.log(`[a3erp] empresa=${empresa.codigo} base=${empresa.base} modo=${args.modo} desde=${rango.desde} hasta=${rango.hasta}`);

  const tramos = tramosMensuales(rango.desde, rango.hasta);
  let docsTotales = 0;
  let lineasTotales = 0;

  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i];
    const filas = await leerCuboVentas(construirSQL(empresa.base, t.desde, t.hasta), empresa.base);
    const { documentos, lineas } = normalizarRows(filas, empresa.codigo);
    docsTotales += documentos.length;
    lineasTotales += lineas.length;

    const resumen = await cargarVentas({
      desde: t.desde,
      hasta: t.hasta,
      empresaCodigo: empresa.codigo,
      documentos: documentos.map((d) => ({ ...d, fecha: d.fecha })),
      lineas,
      meta: {
        base: empresa.base,
        modo: args.modo,
        documentos: documentos.length,
        lineas: lineas.length,
        tramo: `${i + 1}/${tramos.length}`,
      },
    });
    console.log(`[a3erp] ${t.desde} → ${t.hasta}: ${documentos.length} documentos · ${lineas.length} líneas · ${JSON.stringify(resumen)}`);

    try {
      await enlazarFechas(empresa, t.desde, t.hasta);
    } catch (e) {
      console.error(`[a3erp] enlace pedido→factura (no crítico): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`[a3erp] TOTAL: ${docsTotales} documentos · ${lineasTotales} líneas en ${tramos.length} tramos`);

  // Al terminar la carga, refresca la vista materializada de rendimiento para que la app
  // sirva los agregados mensuales ya calculados (ver 0038_perf_vistas_materializadas.sql).
  // No debe romper la ingesta si falla: los datos ya están cargados y la vista se puede
  // refrescar manualmente con `select public.refresh_mv_perf();`.
  try {
    await refrescarVistas();
    console.log('[a3erp] refresh_mv_perf: OK');
  } catch (e) {
    console.error(`[a3erp] refresh_mv_perf (no crítico): ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((e) => {
  console.error(`[a3erp] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});