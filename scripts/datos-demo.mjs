// ============================================================
// Generador de datos de demostración del cuadro de mando.
// Uso:  node scripts/datos-demo.mjs > docs/datos-demo.sql
// Genera un escenario ficticio pero coherente (estacionalidad,
// carteras por comercial, abonos, compras a China con flete y
// tipo de cambio, cobros a plazos, incidencias, presupuesto).
// Los IDs son UUID fijos (deterministas) y los inserts llevan
// `on conflict (id) do nothing` => reejecutable sin duplicar.
// NO toca profiles/auth (se conservan los superusuarios).
// ============================================================

let seq = 0;
const prng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rnd = prng(20260907);
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const hex = (n, len) => n.toString(16).padStart(len, '0');
const uid = (tag, i) => `${hex(i, 8)}-${hex(tag, 4)}-4000-8000-${hex(tag, 4)}${hex(i, 8)}`;

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const hoy = new Date('2026-09-07');

const sql = [];
const catSQL = (tabla, cols, filas, conflict = 'id') => {
  const c = cols.join(',');
  for (let k = 0; k < filas.length; k += 300) {
    const chunk = filas.slice(k, k + 300);
    sql.push(`insert into public.${tabla} (${c}) values\n` +
      chunk.map((f) => `  (${f.join(',')})`).join(',\n') +
      ` on conflict (${conflict}) do nothing;`);
  }
};

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v) => (v === null || v === undefined ? 'null' : v.toFixed ? v.toFixed(2) : String(v));

// ---------- catálogos con IDs fijos ----------
const SUB_E = `(select id from public.empresas where codigo='SF')`;

let TI = 0;
let PRO = 0;
let FOR = 0;
let GRU = 0;
const cadaTipo = {
  proveedor(nombre, pais, plazo) { const id = uid(0x40b0, ++PRO); return { id, nombre, pais, plazo }; },
  formato(nombre) { const id = uid(0x40c0, ++FOR); return { id, nombre }; },
  grupo(nombre) { const id = uid(0x40d0, ++GRU); return { id, nombre }; },
  familia(nombre) { const id = uid(0x40e0, ++TI); return { id, nombre }; },
};

const proveedores = [
  cadaTipo.proveedor('Shanghai Sanitary Import-Export Ltd.', 'China', 90),
  cadaTipo.proveedor('Grifería Alemana Europa GmbH', 'Alemania', 30),
  cadaTipo.proveedor('Porcelanas Castellón S.A.', 'España', 21),
];
const formatos = ['pza', 'pack_x2', 'pack_x4', 'caja', 'palet'].map(cadaTipo.formato);
const grupos = ['Grupo Levante', 'Grupo Ibiza'].map(cadaTipo.grupo);
const familias = [
  'Griferia', 'Sanitarios', 'Mamparas', 'Mobiliario',
  'Accesorios', 'Iluminacion', 'Platos y columnas',
].map(cadaTipo.familia);

catSQL('proveedores', ['id', 'nombre', 'pais', 'plazo_entrega_dias', 'activo'], proveedores.map((p) => [q(p.id), q(p.nombre), q(p.pais), n(p.plazo), 'true']));
catSQL('formatos_articulo', ['id', 'nombre'], formatos.map((f) => [q(f.id), q(f.nombre)]));
catSQL('grupos_empresariales', ['id', 'nombre'], grupos.map((g) => [q(g.id), q(g.nombre)]));
catSQL('familias_articulo', ['id', 'nombre'], familias.map((f) => [q(f.id), q(f.nombre)]));

const canalId = (nombre) => `(select id from public.canales where nombre=${q(nombre)})`;
const marcaId = (nombre) => `(select id from public.marcas where nombre=${q(nombre)})`;

// ---------- comerciales ----------
let CO = 0;
const mkComercial = (codigo, nombre) => ({ id: uid(0x41a0, ++CO), codigo, nombre });

const comerciales = [
  mkComercial('COM-01', 'Lucía Ferrer'),
  mkComercial('COM-02', 'Marco Rossi'),
  mkComercial('COM-03', 'Ana Vidal'),
];
sql.push(`delete from public.comerciales where codigo_erp like 'DEMO-%';`);
catSQL('comerciales', ['id', 'codigo_erp', 'nombre', 'email', 'activo'], comerciales.map((c) => [q(c.id), q(c.codigo), q(c.nombre), q(`${c.codigo}@demo.local`), 'true']));

// ---------- clientes ----------
let CL = 0;
const mkCliente = (nombre, comercial, canal, pais, provincia, opts = {}) => {
  const id = uid(0x42a0, ++CL);
  return {
    id,
    codigo: `C-${String(CL).padStart(3, '0')}`,
    nombre,
    cif: `B${12345678 + CL}`,
    comercial: comercial.id,
    canal,
    pais_fact: pais,
    provincia: provincia ?? '',
    grupo: opts.grupo ?? null,
    estado: opts.estado ?? 'activo',
    primer: opts.primer ?? '2024-01-15',
    limite: opts.limite ?? 30000,
    plazo: opts.plazo ?? 30,
  };
};

const clientes = [
  mkCliente('Baños Norte S.L.', comerciales[0], 'tienda', 'España', 'Navarra', { limite: 25000, plazo: 30 }),
  mkCliente('Cerámica Ibiza', comerciales[0], 'tienda', 'España', 'Illes Balears', { grupo: grupos[1], limite: 60000, plazo: 60, primer: '2023-06-01' }),
  mkCliente('Lavamos S.L.', comerciales[1], 'tienda', 'España', 'Madrid', { limite: 20000, plazo: 30 }),
  mkCliente('Bañera y Cía', comerciales[2], 'tienda', 'España', 'Barcelona', { limite: 15000, plazo: 30 }),
  mkCliente('Construcciones Levante', comerciales[0], 'construccion', 'España', 'Valencia', { grupo: grupos[0], limite: 50000, plazo: 45, primer: '2023-02-10' }),
  mkCliente('Promotora Azahar', comerciales[1], 'construccion', 'España', 'Alicante', { limite: 40000, plazo: 45 }),
  mkCliente('Obras del Sol', comerciales[2], 'construccion', 'España', 'Málaga', { limite: 35000, plazo: 45, primer: '2023-11-20' }),
  mkCliente('Muebles Montiel S.A.', comerciales[1], 'fabricante_mueble', 'España', 'Valencia', { grupo: grupos[0], limite: 80000, plazo: 60, primer: '2022-09-01' }),
  mkCliente('Kitchens & Bath DP', comerciales[2], 'fabricante_mueble', 'Portugal', 'Lisboa', { limite: 45000, plazo: 60, primer: '2023-05-05' }),
  mkCliente('Bath Italia srl', comerciales[0], 'tienda', 'Italia', 'Milano', { limite: 30000, plazo: 45 }),
  mkCliente('Maison des Salles', comerciales[1], 'construccion', 'Francia', 'Lyon', { limite: 55000, plazo: 45 }),
  mkCliente('Portugal Banho Lda', comerciales[0], 'construccion', 'Portugal', 'Porto', { limite: 20000, plazo: 30 }),
  mkCliente('Badkamer GmbH', comerciales[2], 'tienda', 'Alemania', 'München', { limite: 40000, plazo: 45 }),
  mkCliente('Hogar Vasco', comerciales[1], 'tienda', 'España', 'Guipúzcoa', { limite: 18000, plazo: 30 }),
  mkCliente('Ferromanía Depot', comerciales[2], 'tienda', 'España', 'Zaragoza', { estado: 'inactivo', primer: '2024-03-12', limite: 10000, plazo: 30 }),
  mkCliente('Baños del Sur (cerrado)', comerciales[0], 'tienda', 'España', 'Sevilla', { estado: 'perdido', primer: '2023-08-01', limite: 0, plazo: 30 }),
];

catSQL('clientes',
  ['id', 'codigo_erp', 'nombre', 'cif', 'comercial_id', 'created_at', 'empresa_id', 'grupo_id', 'canal_id',
   'pais_facturacion', 'pais_entrega', 'provincia', 'estado', 'fecha_primer_pedido', 'limite_credito', 'plazo_pactado_dias'],
  clientes.map((c) => [
    q(c.id), q(c.codigo), q(c.nombre), q(c.cif), q(c.comercial.id), q(iso(2024, 1, 2)),
    SUB_E, c.grupo ? q(c.grupo.id) : 'null', canalId(c.canal),
    q(c.pais_fact), q(c.pais_fact), q(c.provincia), q(c.estado), q(c.primer), n(c.limite), n(c.plazo),
  ]));

// ---------- artículos ----------
let AR = 0;
const mkArticulo = (nombre, familia, marca, proveedor, costeEUR, margenPct, opts = {}) => {
  const id = uid(0x43a0, ++AR);
  const pv = costeEUR / (1 - margenPct);
  return {
    id,
    codigo: `A-${String(1000 + AR)}`,
    nombre,
    familia: familia.id,
    marca,
    formato: pick(formatos).id,
    proveedor: proveedor.id,
    coste: costeEUR,
    pv,
    tarifa: pv * 1.04,
    puntoPedido: opts.puntoPedido ?? ri(20, 90),
    estado: opts.estado ?? 'activo',
    activo: opts.estado ? opts.estado !== 'descatalogado' : true,
  };
};

const SB = 'Starbath Plus';
const MB = 'Marca blanca';
const articulos = [
  mkArticulo('Grifo monomando cocina cromado', familias[0], SB, proveedores[0], 8.2, 0.45),
  mkArticulo('Grifo lavabo 1M cromado', familias[0], SB, proveedores[0], 6.4, 0.45),
  mkArticulo('Grifo ducha termostático', familias[0], SB, proveedores[0], 14.5, 0.42),
  mkArticulo('Mezclador bidé', familias[0], MB, proveedores[0], 4.1, 0.38),
  mkArticulo('Grifo de corte empotrable', familias[0], SB, proveedores[1], 18.9, 0.4),
  mkArticulo('Inodoro compacto 4,5 l', familias[1], SB, proveedores[0], 26.0, 0.4),
  mkArticulo('Inodoro suspendido', familias[1], SB, proveedores[0], 31.5, 0.4),
  mkArticulo('Inodoro marca blanca euro', familias[1], MB, proveedores[0], 18.0, 0.33),
  mkArticulo('Lavabo sobreencimera 60', familias[1], SB, proveedores[0], 12.2, 0.45),
  mkArticulo('Lavabo suspendido 50', familias[1], MB, proveedores[0], 9.5, 0.4),
  mkArticulo('Cisterna empotrada + pulsador', familias[1], SB, proveedores[0], 15.0, 0.42),
  mkArticulo('Mampara fija 6 mm', familias[2], SB, proveedores[1], 42.0, 0.45, { puntoPedido: 12 }),
  mkArticulo('Mampara abatible 6 mm', familias[2], SB, proveedores[1], 48.0, 0.45),
  mkArticulo('Mampara corredera 8 mm', familias[2], SB, proveedores[1], 55.0, 0.42),
  mkArticulo('Panel ducha esquina', familias[2], MB, proveedores[0], 30.0, 0.35),
  mkArticulo('Mueble lavabo 80 cm', familias[3], SB, proveedores[0], 34.0, 0.48),
  mkArticulo('Mueble lavabo 120 cm', familias[3], SB, proveedores[0], 45.0, 0.48, { puntoPedido: 8 }),
  mkArticulo('Encimera lavabo 100', familias[3], MB, proveedores[0], 22.0, 0.4),
  mkArticulo('Espejo LED 80', familias[3], SB, proveedores[0], 19.0, 0.5),
  mkArticulo('Toallero radiante 60x90', familias[3], SB, proveedores[1], 33.0, 0.45),
  mkArticulo('Estante esquina cromo', familias[4], SB, proveedores[0], 2.8, 0.5),
  mkArticulo('Barra de ducha 90 cm', familias[4], SB, proveedores[0], 5.2, 0.5),
  mkArticulo('Dispensador jabón latón', familias[4], SB, proveedores[1], 6.8, 0.52),
  mkArticulo('Portarrollos 304', familias[4], SB, proveedores[0], 3.9, 0.5),
  mkArticulo('Cubeta accesorios negro', familias[4], MB, proveedores[0], 2.1, 0.38),
  mkArticulo('Aplique LED baño 3000K', familias[5], SB, proveedores[1], 9.8, 0.55),
  mkArticulo('Aplique LED baño 4000K', familias[5], SB, proveedores[1], 10.4, 0.55),
  mkArticulo('Cinta LED bajo mueble', familias[5], MB, proveedores[0], 4.2, 0.4),
  mkArticulo('Plato ducha 90x90', familias[6], SB, proveedores[0], 38.0, 0.42, { puntoPedido: 15 }),
  mkArticulo('Plato ducha 120x80', familias[6], SB, proveedores[0], 46.0, 0.42, { puntoPedido: 15 }),
  mkArticulo('Plato ducha 90x90 baja pendiente', familias[6], MB, proveedores[0], 29.0, 0.35, { puntoPedido: 12 }),
  mkArticulo('Columna hidromasaje', familias[6], SB, proveedores[0], 120.0, 0.4, { puntoPedido: 4 }),
  mkArticulo('Grifo cocina extensible 2025', familias[0], SB, proveedores[0], 11.5, 0.5, { estado: 'novedad' }),
  mkArticulo('Grifo cocina negro mate', familias[0], SB, proveedores[0], 12.9, 0.5, { estado: 'novedad' }),
  mkArticulo('Serie Mamparas Steel 2024', familias[2], SB, proveedores[1], 40.0, 0.4, { estado: 'descatalogado' }),
  mkArticulo('Inodoro Sprint blanco escarcha', familias[1], SB, proveedores[0], 27.0, 0.35, { estado: 'descatalogado' }),
];

catSQL('articulos',
  ['id', 'codigo_erp', 'nombre', 'familia_id', 'coste_unitario', 'precio_venta', 'activo', 'created_at', 'updated_at',
   'empresa_id', 'marca_id', 'marca_blanca_cliente_id', 'formato_id', 'proveedor_id', 'estado', 'precio_tarifa', 'punto_pedido'],
  articulos.map((a) => [
    q(a.id), q(a.codigo), q(a.nombre), q(a.familia.id), n(a.coste), n(a.pv), a.activo ? 'true' : 'false',
    q(iso(2023, 12, 1)), q(iso(2023, 12, 1)), SUB_E, marcaId(a.marca),
    a.marca === MB ? q(clientes.find((c) => c.nombre === 'Muebles Montiel S.A.').id) : 'null',
    q(a.formato), q(a.proveedor.id), q(a.estado), n(a.tarifa), n(a.puntoPedido),
  ]));

// ---------- almacenes ----------
let AL = 0;
const almacenes = [
  { id: uid(0x44a0, ++AL), codigo: 'ALM-PAM', nombre: 'Almacén Pamplona' },
  { id: uid(0x44a0, ++AL), codigo: 'ALM-MAD', nombre: 'Almacén Móstoles' },
  { id: uid(0x44a0, ++AL), codigo: 'ALM-BCN', nombre: 'Almacén Barcelona' },
];
catSQL('almacenes', ['id', 'codigo_erp', 'nombre', 'direccion', 'empresa_id'],
  almacenes.map((w) => [q(w.id), q(w.codigo), q(w.nombre), q('Dirección demo'), SUB_E]));

// ---------- compras (lotes de aprovisionamiento) ----------
let CP = 0;
let LSA = [];
const compras = [];
const compraLineas = [];
const mesesCompra = [];
for (let mm = 0; mm < 20; mm++) {
  const yy = 2025 + Math.floor(mm / 12);
  const mes = (mm % 12) + 1;
  if (mes === 8) continue;
  mesesCompra.push({ yy, mes });
}
mesesCompra.forEach(({ yy, mes }, i) => {
  const prov = i % 3 === 2 ? proveedores[1] : proveedores[0];
  const moneda = prov.id === proveedores[0].id ? 'USD' : 'EUR';
  const tc = prov.id === proveedores[0].id ? (0.89 + rnd() * 0.06).toFixed(6) : '1.000000';
  const compra = {
    id: uid(0x45a0, ++CP),
    numero: `PC-${yy}-${String(mes).padStart(2, '0')}`,
    proveedor: prov,
    fecha: iso(yy, mes, ri(3, 6)),
    moneda,
    tc,
    flete: ri(600, 3200),
    aduana: ri(400, 2200),
    seguro: ri(80, 260),
    trans: ri(150, 420),
  };
  compras.push(compra);
  const nArt = ri(3, 6);
  const sel = [...articulos].sort(() => rnd() - 0.5).slice(0, nArt);
  sel.forEach((a) => {
    const cant = ri(40, 400);
    const costeU = a.coste / (prov.id === proveedores[0].id ? Number(tc) : 1) * (1 + rnd() * 0.15);
    compraLineas.push({ id: uid(0x45b0, ++LSA), compra, articulo: a, cantidad: cant, costeU, roturas: ri(0, 30) / 10 });
  });
});

catSQL('compras',
  ['id', 'numero_erp', 'empresa_id', 'proveedor_id', 'fecha', 'moneda', 'tipo_cambio', 'flete', 'aduana', 'seguro', 'transporte_interior', 'fecha_estimada_llegada', 'fecha_llegada'],
  compras.map((c) => [
    q(c.id), q(c.numero), SUB_E, q(c.proveedor.id), q(c.fecha), q(c.moneda), n(Number(c.tc)),
    c.flete.toFixed(2), c.aduana.toFixed(2), c.seguro.toFixed(2), c.trans.toFixed(2),
    q(iso(Number(c.fecha.slice(0, 4)), Number(c.fecha.slice(5, 7)), 28)), q(iso(Number(c.fecha.slice(0, 4)), Number(c.fecha.slice(5, 7)), 26)),
  ]));
catSQL('compra_lineas', ['id', 'compra_id', 'articulo_id', 'cantidad', 'coste_unitario_compra', 'pct_roturas'],
  compraLineas.map((l) => [q(l.id), q(l.compra.id), q(l.articulo.id), n(l.cantidad), l.costeU.toFixed(4), l.roturas.toFixed(2)]));

// ---------- facturación (20 meses con estacionalidad, abonos y comercios) ----------
const estacionalidad = [1.0, 1.0, 1.15, 1.3, 1.8, 1.65, 0.75, 0.6, 1.15, 1.1, 1.25, 1.3];
const facturas = [];
const facturaLineas = [];
let FC = 0;
let FL = 0;

const mesFechas = [];
for (let mm = 0; mm < 20; mm++) {
  const yy = 2025 + Math.floor((mm) / 12);
  let mes = ((mm) % 12) + 1;
  if (mes <= 8 && yy === 2026) continue; // ventas hasta ago-2026 (hoy es sept)
  if (mes === 8 && yy === 2025) continue;
  mesFechas.push({ yy, mes });
}
// nota: bucle for de 0..20 genera 20 meses: 2025 (ene-dic salvo agosto) y 2026 ene-ago
const listaMeses = [];
for (let mm = 0; mm < 20; mm++) {
  const yy = 2025 + Math.floor(mm / 12);
  const mes = (mm % 12) + 1;
  if (mes === 8) continue;
  if (yy === 2026 && mes > 8) continue;
  listaMeses.push({ yy, mes });
}

const numFacturasMes = (yy, mes) => {
  const base = 30 + (rnd() * 12 - 6);
  return Math.max(12, Math.round(base * estacionalidad[mes - 1]));
};
const red = (v) => Math.round(v * 100) / 100;
let seqF = 0;
let pedidoAsociado = [];

listaMeses.forEach(({ yy, mes }) => {
  const nf = numFacturasMes(yy, mes);
  const clientesMes = clientes.filter((c) => c.estado === 'activo' || (c.estado === 'inactivo' && yy === 2025));
  for (let i = 0; i < nf; i++) {
    const cl = pick(clientesMes);
    const dia = ri(3, 27);
    const fecha = iso(yy, mes, dia);
    const nLin = ri(1, 3);
    let base = 0;
    const lines = [];
    const artsSel = [...articulos.filter((a) => a.estado !== 'descatalogado')].sort(() => rnd() - 0.5).slice(0, nLin);
    artsSel.forEach((a) => {
      const cant = ri(2, 40);
      const pvd = red(a.tarifa * (0.92 + rnd() * 0.1));
      const desc = ri(0, 8);
      base += red(cant * pvd * (1 - desc / 100));
      lines.push([a, cant, pvd, desc]);
    });
    const portes = rnd() < 0.25 ? ri(20, 90) : 0;
    const descPie = rnd() < 0.1 ? ri(10, 80) : 0;
    let total = red(base - descPie + portes);
    const doc = rnd();
    const tipo = doc < 0.02 ? 'abono' : doc < 0.03 ? 'nota_cargo' : 'factura';
    const numero = `F-${yy}-${String(mes).padStart(2, '0')}-${String(++seqF).padStart(3, '0')}`;
    const id = uid(0x46a0, ++FC);
    const anula = tipo === 'abono' ? facturas.filter((f) => f.tipo === 'factura').slice(-5) : [];
    const anulada = anula.length && rnd() < 0.5 ? anula[pick(anula.map((_, j) => j))].id : null;
    if (tipo === 'abono') { base = -Math.abs(base); total = -Math.abs(total); }
    facturas.push({
      id, numero, fecha, cliente: cl, tipo, base, total, portes, descPie,
      anulaId: anulada, albaran: `AL-${yy}${String(mes).padStart(2, '0')}-${String(seqF).padStart(4, '0')}`,
    });
    lines.forEach(([a, cant, pvd, desc]) => {
      facturaLineas.push({ id: uid(0x46b0, ++FL), facturaId: id, articulo: a, cant, pvd, desc, costeU: a.coste });
    });
  }
});

catSQL('facturas',
  ['id', 'numero_erp', 'fecha', 'cliente_id', 'comercial_id', 'base_imponible', 'total', 'created_at', 'empresa_id',
   'tipo_documento', 'factura_anula_id', 'pedido_id', 'albaran_numero', 'descuento_pie', 'portes', 'rappel_devengado'],
  facturas.map((f) => [
    q(f.id), q(f.numero), q(f.fecha), q(f.cliente.id), q(f.cliente.comercial.id), n(f.base), n(f.total),
    q(`${f.fecha}T12:00:00Z`), SUB_E, q(f.tipo),
    f.anulaId ? q(f.anulaId) : 'null', 'null', q(f.albaran), n(f.descPie), n(f.portes), '0.00',
  ]));
catSQL('factura_lineas', ['id', 'factura_id', 'articulo_id', 'cantidad', 'precio_unitario', 'coste_unitario', 'descuento_pct'],
  facturaLineas.map((l) => [q(l.id), q(l.facturaId), q(l.articulo.id), n(l.cant), l.pvd.toFixed(2), l.costeU.toFixed(2), n(l.desc)]));

// ---------- pedidos (históricos servidos + cartera abierta) ----------
let PD = 0;
let PLINE = 0;
const pedidos = [];
const pedidoLineas = [];
const ultimasUvas = facturas.slice(-180).filter((f) => f.tipo === 'factura');
ultimasUvas.forEach((f) => {
  const num = f.numero.replace('F-', 'P-');
  pedidos.push({
    id: uid(0x47a0, ++PD), numero: num, cliente: f.cliente, fecha: f.fecha,
    estado: 'servido', fechaServ: f.fecha, importe: f.base,
  });
  facturaLineas.filter((l) => l.facturaId === f.id).forEach((l) => {
    pedidoLineas.push({ id: uid(0x47b0, ++PLINE), pedidoId: pedidos[pedidos.length - 1].id, articulo: l.articulo, cant: l.cant, servida: l.cant, pvd: l.pvd, desc: l.desc, fechaServ: f.fecha });
  });
});
// cartera pendiente (últimos 45 días)
for (let i = 0; i < 34; i++) {
  const cl = pick(clientes.filter((c) => c.estado === 'activo'));
  const dd = 1 + Math.floor(rnd() * 45);
  const f = new Date(hoy.getTime() - dd * 86400000);
  const fecha = iso(f.getFullYear(), f.getMonth() + 1, f.getDate());
  const estado = rnd() < 0.15 ? 'anulado' : rnd() < 0.3 ? 'parcial' : rnd() < 0.6 ? 'aceptado' : 'captado';
  const numero = `P-OPEN-${String(++seqF).padStart(4, '0')}`;
  const nLin = ri(1, 3);
  let importe = 0;
  const selA = [...articulos.filter((a) => a.estado !== 'descatalogado')].sort(() => rnd() - 0.5).slice(0, nLin);
  const pedidoId = uid(0x47a0, ++PD);
  pedidos.push({
    id: pedidoId, numero, cliente: cl, fecha, estado,
    motivo: estado === 'anulado' ? (pick(['precio no acordado', 'sustituido por competidor', 'error de cliente']) ) : null,
    servida: estado === 'servido' ? 0 : estado === 'parcial' ? 1 : 0,
    importe: 0,
  });
  const plazo = cl.plazo || 30;
  selA.forEach((a) => {
    const cant = ri(4, 30);
    const pvd = red(a.tarifa * (0.94 + rnd() * 0.06));
    const servida = estado === 'parcial' ? Math.round(cant / 2) : 0;
    importe += red(cant * pvd);
    const fSol = new Date(hoy.getTime() + ri(15, 60) * 86400000);
    pedidoLineas.push({ id: uid(0x47b0, ++PLINE), pedidoId, articulo: a, cant, servida, pvd, desc: 0, fechaServ: servida ? iso(fSol.getFullYear(), fSol.getMonth() + 1, fSol.getDate()) : null });
  });
  pedidos[pedidos.length - 1].importe = red(importe);
}
catSQL('pedidos',
  ['id', 'numero_erp', 'empresa_id', 'cliente_id', 'comercial_id', 'fecha_entrada', 'fecha_solicitada', 'fecha_entrega_real', 'estado', 'motivo_anulacion', 'importe'],
  pedidos.map((p) => {
    const fSol = new Date(new Date(p.fecha).getTime() + 25 * 86400000);
    return [
      q(p.id), q(p.numero), SUB_E, q(p.cliente.id), q(p.cliente.comercial.id), q(p.fecha),
      q(iso(fSol.getFullYear(), fSol.getMonth() + 1, fSol.getDate())),
      p.estado === 'servido' ? q(p.fecha) : 'null', q(p.estado),
      p.motivo ? q(p.motivo) : 'null', p.importe.toFixed(2),
    ];
  }));
catSQL('pedido_lineas', ['id', 'pedido_id', 'articulo_id', 'cantidad', 'cantidad_servida', 'precio_unitario', 'descuento_pct', 'fecha_servida'],
  pedidoLineas.map((l) => [q(l.id), q(l.pedidoId), q(l.articulo.id), n(l.cant), n(l.servida ?? 0), l.pvd.toFixed(2), n(l.desc ?? 0), l.fechaServ ? q(l.fechaServ) : 'null']));

// ---------- stock ----------
let ST = 0;
let SM = 0;
let STR = 0;
const stockActual = [];
articulos.forEach((a, idx) => {
  if (a.estado === 'descatalogado') return;
  almacenes.forEach((w, i) => {
    if (idx % 7 === 0 && i === 0) {
      stockActual.push({ articulo: a, almacen: w, cantidad: ri(2, 12), reservado: 0 });
      return;
    }
    if (idx % 7 === 0 && i === 1) {
      stockActual.push({ articulo: a, almacen: w, cantidad: ri(0, 6), reservado: 0 });
      return;
    }
    const onHand = i === 0 ? ri(60, 420) : i === 1 ? ri(0, 160) : ri(0, 90);
    const reservado = onHand ? Math.round(onHand * rnd() * 0.15) : 0;
    stockActual.push({ articulo: a, almacen: w, cantidad: onHand, reservado });
  });
});
catSQL('stock_actual', ['id', 'articulo_id', 'almacen_id', 'cantidad', 'actualizado_en', 'stock_reservado'],
  stockActual.map((s) => [q(uid(0x48a0, ++ST)), q(s.articulo.id), q(s.almacen.id), n(s.cantidad), q('2026-09-06T22:00:00Z'), n(s.reservado)]));
// reemplaza conflict articulo+almacen: emitimos con on conflict por pk id; para no duplicar al re-ejecutar usamos ids fijos + do nothing

// stock en tránsito
const comprasRecientes = compras.filter((c) => c.fecha >= '2026-06-01').slice(0, 4);
comprasRecientes.forEach((c) => {
  const l = compraLineas.filter((x) => x.compra.id === c.id)[0];
  if (l) stockActual.push({});
});
const enTransito = [];
comprasRecientes.forEach((c, i) => {
  const lin = compraLineas.find((x) => x.compra.id === c.id);
  if (lin) {
    const f = new Date('2026-09-07');
    const fE = iso(f.getFullYear(), f.getMonth() + 1, Math.min(28, f.getDate() + ri(12, 30)));
    enTransito.push({ articulo: lin.articulo, compra: c, cantidad: lin.cantidad, fE });
  }
});
catSQL('stock_en_transito', ['id', 'articulo_id', 'compra_id', 'empresa_id', 'cantidad', 'fecha_estimada_llegada'],
  enTransito.map((t) => [q(uid(0x48c0, ++STR)), q(t.articulo.id), q(t.compra.id), SUB_E, n(t.cantidad), q(t.fE)]));

// movimientos (una muestra ligera)
const stockMovs = [];
articulos.filter((a) => a.estado !== 'descatalogado').slice(0, 40).forEach((a) => {
  stockMovs.push({ articulo: a, almacen: almacenes[0], tipo: 'entrada', cant: ri(50, 300), ref: `E-2026-${String(++seqF).padStart(4, '0')}` });
});
catSQL('stock_movimientos', ['id', 'articulo_id', 'almacen_id', 'tipo', 'cantidad', 'referencia_erp', 'fecha', 'empresa_id'],
  stockMovs.map((m) => [q(uid(0x48b0, ++SM)), q(m.articulo.id), q(m.almacen.id), q(m.tipo), n(m.cant), q(m.ref), q('2026-09-05T09:00:00Z'), SUB_E]));

// ---------- cobros ----------
let CB = 0;
const cobros = [];
facturas.filter((f) => f.tipo !== 'abono').forEach((f) => {
  const plazo = f.cliente.plazo || 30;
  const dias = ri(plazo - 8, plazo + 15);
  const fecha = new Date(new Date(f.fecha).getTime() + dias * 86400000);
  const over90 = new Date('2026-06-01').getTime() - new Date(f.fecha).getTime() > 60 * 86400000 && rnd() < 0.12;
  const fracc = rnd();
  if (over90) {
    cobros.push({ factura: f, fecha, importe: red(f.total * (0.4 + rnd() * 0.3)), impagado: rnd() < 0.25 });
  } else if (fracc < 0.06) {
    const f2 = new Date(fecha.getTime() + 30 * 86400000);
    cobros.push({ factura: f, fecha, importe: red(f.total * 0.5), impagado: false });
    cobros.push({ factura: f, fecha: f2, importe: red(f.total * 0.5), impagado: false });
  } else {
    cobros.push({ factura: f, fecha, importe: f.total, impagado: false });
  }
});
catSQL('cobros', ['id', 'empresa_id', 'cliente_id', 'factura_id', 'fecha', 'importe', 'metodo', 'impagado'],
  cobros.map((cb) => [q(uid(0x49a0, ++CB)), SUB_E, q(cb.factura.cliente.id), q(cb.factura.id),
    q(iso(cb.fecha.getFullYear(), cb.fecha.getMonth() + 1, cb.fecha.getDate())), n(cb.importe), q('transferencia'), cb.impagado ? 'true' : 'false']));

// ---------- incidencias ----------
let IN = 0;
const tipos = ['rotura_transporte', 'defecto_fabricacion', 'error_pedido', 'error_expedicion', 'rechazo_comercial'];
const incidencias = [];
for (let i = 0; i < 14; i++) {
  const f = pick(facturas.filter((x) => x.tipo === 'factura'));
  const tipo = pick(tipos);
  incidencias.push({
    cliente: f.cliente, articulo: pick(articulos), pedido: null, tipo,
    importe: red(f.total * (0.02 + rnd() * 0.1)),
    estado: rnd() < 0.2 ? 'abierta' : rnd() < 0.5 ? 'rechazada' : 'resuelta',
    fecha: new Date(new Date(f.fecha).getTime() + ri(2, 20) * 86400000),
  });
}
catSQL('incidencias', ['id', 'empresa_id', 'cliente_id', 'articulo_id', 'pedido_id', 'tipo', 'importe', 'estado', 'fecha'],
  incidencias.map((x) => {
    const f = new Date(x.fecha);
    return [q(uid(0x4a00, ++IN)), SUB_E, q(x.cliente.id), q(x.articulo.id), 'null', q(x.tipo), n(x.importe), q(x.estado),
      q(iso(f.getFullYear(), f.getMonth() + 1, f.getDate()))];
  }));

// ---------- presupuesto 2026 (comercial x familia x mes) ----------
let PR = 0;
const presupuesto = [];
comerciales.forEach((c) => {
  familias.forEach((fa) => {
    for (let mes = 1; mes <= 12; mes++) {
      const imp = red((6000 + rnd() * 14000) * (c.nombre === 'Lucía Ferrer' ? 1.3 : 1));
      presupuesto.push({ comercial: c, familia: fa, mes, importe: imp });
    }
  });
});
catSQL('presupuesto', ['id', 'empresa_id', 'ejercicio', 'mes', 'cliente_id', 'comercial_id', 'familia_id', 'importe'],
  presupuesto.map((p) => [q(uid(0x4b00, ++PR)), SUB_E, 2026, n(p.mes), 'null', q(p.comercial.id), q(p.familia.id), n(p.importe)]));

// ---------- estadísticas ----------
sql.push(`-- --------------------------------------`);
sql.push(`-- DATOS DE DEMOSTRACIÓN GENERADOS:`);
sql.push(`--   ${comerciales.length} comerciales · ${clientes.length} clientes · ${articulos.length} artículos · ${familias.length} familias`);
sql.push(`--   ${facturas.length} facturas y ${facturaLineas.length} líneas · ${pedidos.length} pedidos · ${pedidoLineas.length} líneas`);
sql.push(`--   ${compras.length} lotes de compra (${compraLineas.length} líneas) · ${cobros.length} cobros · ${incidencias.length} incidencias`);
sql.push(`--   ${presupuesto.length} filas de presupuesto · ${stockActual.length} posiciones de stock · ${enTransito.length} en tránsito`);
sql.push(`-- --------------------------------------`);

console.log(sql.join('\n'));