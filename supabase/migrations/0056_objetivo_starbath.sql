-- Objetivo anual de facturación Starbath Plus, editable desde /configuracion.
-- Se guarda como umbral (EUR) en alertas_config, igual que el resto de parámetros.

insert into public.alertas_config (modulo, nombre, umbral, unidad, activo, config)
values ('ventas', 'objetivo_starbath', 0, 'EUR', true, '{}'::jsonb)
on conflict (modulo, nombre) do nothing;
