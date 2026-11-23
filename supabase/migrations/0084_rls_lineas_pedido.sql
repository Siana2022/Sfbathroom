-- El comercial debe ver las líneas de los pedidos de su cartera aunque el pedido
-- no tenga comercial_id asignado (se filtra por el comercial del cliente).
drop policy if exists pedido_lineas_select on public.pedido_lineas;
create policy pedido_lineas_select on public.pedido_lineas for select using (
  exists (
    select 1 from public.pedidos p
    where p.id = pedido_lineas.pedido_id
      and (
        public.auth_role() in ('admin','direccion','financiero','lectura','administracion','almacen')
        or (
          public.auth_role() = 'comercial'
          and (
            public.es_mi_comercial(p.comercial_id)
            or p.cliente_id in (
              select c.id from public.clientes c where public.es_mi_comercial(c.comercial_id)
            )
          )
        )
      )
  )
);
