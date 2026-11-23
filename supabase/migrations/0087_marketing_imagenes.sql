-- Bucket público para imágenes de campañas de email.
insert into storage.buckets (id, name, public)
values ('marketing-imagenes', 'marketing-imagenes', true)
on conflict (id) do nothing;

drop policy if exists marketing_imagenes_lectura on storage.objects;
create policy marketing_imagenes_lectura on storage.objects for select
  using (bucket_id = 'marketing-imagenes');

drop policy if exists marketing_imagenes_alta on storage.objects;
create policy marketing_imagenes_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing-imagenes' and public.auth_role() in ('admin','direccion','comercial'));

drop policy if exists marketing_imagenes_cambio on storage.objects;
create policy marketing_imagenes_cambio on storage.objects for update to authenticated
  using (bucket_id = 'marketing-imagenes' and public.auth_role() in ('admin','direccion','comercial'));

drop policy if exists marketing_imagenes_baja on storage.objects;
create policy marketing_imagenes_baja on storage.objects for delete to authenticated
  using (bucket_id = 'marketing-imagenes' and public.auth_role() in ('admin','direccion','comercial'));
