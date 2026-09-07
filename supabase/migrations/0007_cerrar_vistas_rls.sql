-- 0007: cerrar RLS en las vistas que corrían con permisos del owner
-- Hallazgo de la auditoría (2026-09-07): v_aging, v_saldo_clientes,
-- v_stock_cobertura, v_consumo_diario y v_coste_completo_por_lote quedaron
-- en producción sin security_invoker (se aplicó una versión previa de la
-- 0003 sin el flag). Con security_invoker = true la vista usa los permisos
-- del usuario que consulta y se aplican las RLS de las tablas subyacentes,
-- de modo que un rol comercial/lectura solo ve sus propios datos.
-- Idempotente: alter view set puede ejecutarse tantas veces como se quiera.

alter view public.v_aging set (security_invoker = true);
alter view public.v_saldo_clientes set (security_invoker = true);
alter view public.v_stock_cobertura set (security_invoker = true);
alter view public.v_consumo_diario set (security_invoker = true);
alter view public.v_coste_completo_por_lote set (security_invoker = true);