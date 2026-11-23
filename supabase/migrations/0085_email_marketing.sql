-- Email marketing: plantillas, campañas, envíos y bajas.

create table if not exists public.plantillas_email (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  asunto text not null default '',
  bloques jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campanas_email (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  asunto text not null default '',
  remitente text not null default 'sfbathroom <alertas@sfbathroom.com>',
  bloques jsonb not null default '[]'::jsonb,
  segmento jsonb not null default '{}'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador','enviando','enviada','cancelada')),
  total integer not null default 0,
  enviados integer not null default 0,
  fallidos integer not null default 0,
  created_at timestamptz not null default now(),
  enviada_at timestamptz
);

create table if not exists public.campana_envios (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas_email(id) on delete cascade,
  email text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('enviado','error','baja')),
  error text,
  fecha timestamptz not null default now()
);

create index if not exists idx_envios_campana on public.campana_envios(campana_id);

create table if not exists public.email_bajas (
  email text primary key,
  motivo text,
  fecha timestamptz not null default now()
);

alter table public.plantillas_email enable row level security;
alter table public.campanas_email enable row level security;
alter table public.campana_envios enable row level security;
alter table public.email_bajas enable row level security;

drop policy if exists plantillas_email_all on public.plantillas_email;
create policy plantillas_email_all on public.plantillas_email for all using (
  public.auth_role() in ('admin','direccion')
) with check (
  public.auth_role() in ('admin','direccion')
);

drop policy if exists campanas_email_all on public.campanas_email;
create policy campanas_email_all on public.campanas_email for all using (
  public.auth_role() in ('admin','direccion')
) with check (
  public.auth_role() in ('admin','direccion')
);

drop policy if exists campana_envios_select on public.campana_envios;
create policy campana_envios_select on public.campana_envios for select using (
  public.auth_role() in ('admin','direccion')
);

drop policy if exists email_bajas_select on public.email_bajas;
create policy email_bajas_select on public.email_bajas for select using (
  public.auth_role() in ('admin','direccion')
);
