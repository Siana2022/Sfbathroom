-- 0006: umbrales de alertas y saturación configurables (Q6 y Q8-Q19 del cuestionario)
-- Siembra los valores iniciales en alertas_config; despues se editan desde la app
-- (/configuracion, solo admin/direccion gracias a la RLS de 0003).

insert into public.alertas_config (modulo, nombre, umbral, unidad, activo, config) values
  ('stock','rotura',5,'unidades',true,'{"aviso":1}'::jsonb),
  ('stock','bajo_punto_pedido',8,'referencias',true,'{"aviso":1}'::jsonb),
  ('cobros','vencido_total',30000,'EUR',true,'{"aviso":5000}'::jsonb),
  ('clientes','fuga',3,'clientes',true,'{"aviso":1}'::jsonb),
  ('clientes','no_activos',3,'clientes',true,'{"aviso":1}'::jsonb),
  ('presupuesto','desviacion_mes',-15,'pct',true,'{"aviso":-10}'::jsonb),
  ('presupuesto','desviacion_acum',-10,'pct',true,'{}'::jsonb),
  ('ventas','frecuencia_pedido',2.5,'x',true,'{}'::jsonb),
  ('ventas','caida_cliente',-20,'pct',true,'{}'::jsonb),
  ('stock','cobertura',60,'dias',true,'{}'::jsonb),
  ('margen','objetivo',30,'pct',true,'{}'::jsonb),
  ('ventas','erosion_precio',10,'pct',true,'{}'::jsonb),
  ('cobros','dso',1.5,'x',true,'{}'::jsonb),
  ('cobros','vencido_relevante',2000,'EUR',true,'{"dias":60}'::jsonb),
  ('credito','limite_uso',90,'pct',true,'{}'::jsonb),
  ('concentracion','top10',5,'p.p.',true,'{}'::jsonb),
  ('concentracion','familia_cliente',70,'pct',true,'{"relevancia":8}'::jsonb),
  ('proveedores','retraso',75,'dias',true,'{"pactado":60}'::jsonb),
  ('comerciales','saturacion_importe',1500000,'EUR',true,'{"periodo":"trimestre"}'::jsonb),
  ('comerciales','saturacion_clientes',60,'clientes',true,'{"periodo":"trimestre"}'::jsonb)
on conflict (modulo, nombre) do update set
  umbral = excluded.umbral,
  unidad = excluded.unidad,
  activo = true,
  config = excluded.config,
  updated_at = now();