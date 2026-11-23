-- Contacto de la reunión (con copia de sus datos para el histórico).
alter table public.agenda add column if not exists contacto_id uuid references public.clientes_contactos(id) on delete set null;
alter table public.agenda add column if not exists contacto_nombre text;
alter table public.agenda add column if not exists contacto_telefono text;
alter table public.agenda add column if not exists contacto_email text;
