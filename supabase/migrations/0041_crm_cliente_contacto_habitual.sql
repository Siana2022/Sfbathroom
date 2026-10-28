-- ============================================================
-- Módulo "Acceso comercial" · Fase 3 · Persona habitual de contacto
--
-- Un cliente puede tener varias personas dadas de alta, pero en el día a día
-- hay una con la que se habla siempre. Se marca en la ficha y aparece en la
-- cartera, para saber a quién llamar sin abrir el cliente.
--
-- Es una referencia a `contactos` y no un texto libre: el nombre que se enseña
-- en la cartera sale del propio contacto, así que si se corrige el nombre en su
-- ficha, la cartera queda corregida sola. Y `on delete set null` deja la ficha
-- sin persona habitual si ese contacto se borra, en vez de romper la referencia.
--
-- Aditivo y idempotente. Se aplica en Supabase SQL Editor.
-- ============================================================

alter table public.clientes
  add column if not exists contacto_habitual_id uuid
  references public.contactos(id) on delete set null;

create index if not exists idx_clientes_contacto_habitual
  on public.clientes(contacto_habitual_id);
