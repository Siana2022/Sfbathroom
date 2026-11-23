-- Índices para las consultas más frecuentes de la app.
create index if not exists idx_facturas_empresa_fecha on public.facturas(empresa_id, fecha);
create index if not exists idx_facturas_cliente_fecha on public.facturas(cliente_id, fecha);
create index if not exists idx_factura_lineas_factura on public.factura_lineas(factura_id);

create index if not exists idx_pedidos_cliente_fecha on public.pedidos(cliente_id, fecha_entrada);
create index if not exists idx_pedidos_empresa_fecha on public.pedidos(empresa_id, fecha_entrada);
create index if not exists idx_pedido_lineas_pedido on public.pedido_lineas(pedido_id);

create index if not exists idx_agenda_cliente_fecha on public.agenda(cliente_id, fecha);
create index if not exists idx_cobros_cartera_cliente on public.cobros_cartera(cliente_id);

create index if not exists idx_clientes_empresa_comercial on public.clientes(empresa_id, comercial_id);
create index if not exists idx_clientes_empresa_estado on public.clientes(empresa_id, estado);
