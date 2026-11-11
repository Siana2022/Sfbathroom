-- 0037_indices_rendimiento_multiempresa.sql
-- Rendimiento multiempresa (P-mult). El cliente reporta que cambiar de empresa tarda
-- 15-20 s y va a más cada día. Causa estructural: las consultas de lib/datos/* filtran
-- SIEMPRE por empresa + rango de fecha, pero en `facturas` solo existen índices SUELTOS
-- (idx_facturas_fecha e idx_facturas_empresa por separado). Postgres no puede combinar
-- bien dos índices de columna única para un filtro compuesto, así que cada carga escanea
-- cada vez más filas conforme crece el histórico (crecimiento lineal = "va a más").
--
-- Esta migración solo AÑADE índices compuestos (empresa_id, fecha) y equivalentes en las
-- tablas cuyas consultas filtran por empresa + fecha. Es segura e idempotente:
--   * `create index if not exists` → no falla si ya existe, no duplica.
--   * NO borra ningún índice existente (los sueltos siguen sirviendo a otras consultas).
--   * No toca datos ni RLS.
--
-- Nota operativa: en producción, para no bloquear escrituras durante la creación, se puede
-- ejecutar manualmente con `create index concurrently` (no se usa aquí porque CONCURRENTLY
-- no puede ir dentro de una transacción/migración). Con el volumen actual (3.000-5.000
-- facturas/año) la creación es casi instantánea y el lock es irrelevante.

-- ---------- facturas: el filtro caliente de toda la app (empresa + fecha) ----------
create index if not exists idx_facturas_empresa_fecha
  on public.facturas (empresa_id, fecha);

-- Cartera del rol comercial: las consultas RLS/RPC filtran también por comercial_id.
create index if not exists idx_facturas_empresa_comercial_fecha
  on public.facturas (empresa_id, comercial_id, fecha);

-- Top clientes y ficha de cliente por empresa+año.
create index if not exists idx_facturas_empresa_cliente_fecha
  on public.facturas (empresa_id, cliente_id, fecha);

-- ---------- pedidos: se filtra por empresa + fecha_entrada ----------
create index if not exists idx_pedidos_empresa_fecha_entrada
  on public.pedidos (empresa_id, fecha_entrada);

-- ---------- compras: se filtra por empresa + fecha ----------
create index if not exists idx_compras_empresa_fecha
  on public.compras (empresa_id, fecha);

-- ---------- cobros: cartera/DSO filtran por empresa + fecha ----------
create index if not exists idx_cobros_empresa_fecha
  on public.cobros (empresa_id, fecha);
