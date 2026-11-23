-- Bucket privado para adjuntos de las reuniones (actas, fotos, PDF).

insert into storage.buckets (id, name, public)
values ('agenda-adjuntos', 'agenda-adjuntos', false)
on conflict (id) do nothing;

drop policy if exists agenda_adjuntos_select on storage.objects;
create policy agenda_adjuntos_select on storage.objects for select
  using (bucket_id = 'agenda-adjuntos' and auth.role() = 'authenticated');

drop policy if exists agenda_adjuntos_insert on storage.objects;
create policy agenda_adjuntos_insert on storage.objects for insert
  with check (bucket_id = 'agenda-adjuntos' and auth.role() = 'authenticated');

drop policy if exists agenda_adjuntos_delete on storage.objects;
create policy agenda_adjuntos_delete on storage.objects for delete
  using (bucket_id = 'agenda-adjuntos' and auth.role() = 'authenticated');
