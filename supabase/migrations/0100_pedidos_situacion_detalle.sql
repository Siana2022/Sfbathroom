-- Estado real del pedido en A3ERP.
--
-- `CABEPEDV.SITUACION` solo distingue S (servido) y A (abierto/pendiente); los
-- pedidos anulados y los parciales se ven en `SITUACIONDETALLE`. La ingesta
-- traducía A → anulado, que es justo al revés: A es «abierto».
--
-- Idempotente.

alter table public.pedidos add column if not exists situacion_detalle text;

comment on column public.pedidos.situacion_detalle is
  'SITUACIONDETALLE de A3ERP: PENDIENTE, PENDIENTE PARCIAL, SERVIDO..., ANULADO...';
