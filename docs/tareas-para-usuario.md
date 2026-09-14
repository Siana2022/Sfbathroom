# Tareas pendientes — Guía rápida

## Para hoy (acciones del usuario)

### 1. H-4: Leaked Password Protection (1 clic)
Ve a **Supabase → Authentication → Providers → Email** y activa:
- ✅ "Leaked Password Protection"

Esto protege contra contraseñas filtradas. No afecta a usuarios existentes.

### 2. H-2: Repair de migraciones (CLI)
Ejecuta en tu terminal (necesitas Supabase CLI instalado):
```bash
supabase link --project-ref dgbxualxhrbbqglvxtxq
supabase migration repair --status applied 0003 0004 0005 0006
```
Esto sincroniza el registro de migraciones con lo que ya hay desplegado.

### 3. Asignar roles a usuarios
Ve a **Supabase → SQL Editor** y ejecuta:
```sql
-- Primero, ver quién hay:
select u.email, p.role, u.created_at
from auth.users u
left join public.profiles p on p.id = u.id;

-- Luego, asignar rol admin a tu usuario:
update public.profiles 
set role = 'admin'
where id = (
  select id from auth.users 
  where email = 'TU_EMAIL@AQUI.COM'
);
```

### 4. Migración 0008 (tabla de alertas + RPC admin)
Pega el contenido de `supabase/migrations/0008_alertas_correos_enviados.sql` en el SQL Editor.
Crea:
- `alertas_correos_enviados` (log de envíos, evita duplicados del cron)
- `admin_listar_usuarios()` — RPC que alimenta la página `/admin` (lista email, rol y cartera).

### 5. Variables de entorno para el asistente BI
En **Vercel → Settings → Environment Variables**, añade:
- `ANTHROPIC_API_KEY` = tu clave de Anthropic (o cambia a Google Gemini gratis)
- `CHAT_MODEL` = `claude-sonnet-4-5` (opcional)

### 6. Alertas por correo (opcional, cuando quieras)
En Vercel env vars: `RESEND_API_KEY`, `ALERTAS_EMAIL_TO` (destinatarios separados por coma),
`ALERTAS_CRON_SECRET` (secreto compartido), `RESEND_FROM` (opcional). Luego programa un cron
diario (Vercel Cron o n8n) a `https://tu-app/api/alertas/enviar?empresa=SF` con la cabecera
`x-cron-secret`, o si usas Vercel Cron añade en `vercel.json`:
```json
{ "crons": [{ "path": "/api/alertas/enviar?empresa=SF", "schedule": "0 6 * * *" }] }
```
(En ese caso, el secret se pasa como parámetro `secret=` y se protege con `ALERTAS_CRON_SECRET`.)

## Pendiente de datos del cliente

### A3ERP (bloqueado)
- [ ] Credenciales SQL Server del cliente
- [ ] Acceso de red (VPN/firewall)
- [ ] Workflow n8n nocturno

### Financiero (bloqueado)
- [ ] Definir KPIs con el cliente (liquidez, EBITDA, DSO, etc.)
- [ ] Excel/PDF de la gestoría (cuentas anuales)
- [ ] 3-5 ejercicios históricos

### Marketing (bloqueado)
- [ ] Excel histórico >10 años del departamento financiero

### Stock (parcialmente bloqueado)
- [ ] Histórico de fotos de stock (A3ERP)
- [ ] Definir alertas de rotura

## Ya creado pero pendiente de ejecución
- `docs/asignar-roles-usuarios.sql` — rellenar emails y ejecutar
- `docs/asistente-ia.md` — documentación del chat IA
- `app/admin/page.tsx` — gestión de usuarios (acceso solo admin)