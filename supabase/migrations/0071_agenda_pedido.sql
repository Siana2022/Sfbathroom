-- Vínculo de la reunión con el pedido real.
alter table public.agenda add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
