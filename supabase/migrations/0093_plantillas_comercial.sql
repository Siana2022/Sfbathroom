-- Plantillas de reunión por comercial (null = plantilla general de la empresa).
alter table public.reunion_plantillas add column if not exists comercial_id uuid references public.comerciales(id) on delete cascade;
create index if not exists idx_reunion_plantillas_comercial on public.reunion_plantillas(comercial_id);

drop policy if exists reunion_plantillas_all on public.reunion_plantillas;
create policy reunion_plantillas_all on public.reunion_plantillas for all using (
  public.auth_role() in ('admin','direccion')
  or (
    public.auth_role() = 'comercial'
    and (comercial_id is null or public.es_mi_comercial(comercial_id))
  )
) with check (
  public.auth_role() in ('admin','direccion')
  or (public.auth_role() = 'comercial' and public.es_mi_comercial(comercial_id))
);
