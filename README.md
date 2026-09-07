# sfbathroom BI

Plataforma de Business Intelligence a medida para sfbathroom (sustituye a Power BI).
Next.js 14 + Supabase + Vercel.

👉 Antes de tocar nada, lee **`CLAUDE.md`** — ahí está el contexto completo del proyecto,
el estado real de la infraestructura y las decisiones ya tomadas con el cliente.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellenar con las claves de Supabase (ver abajo)
npm run dev
```

## Variables de entorno

Ver `.env.example`. La URL y la publishable key de Supabase están también hardcodeadas como
fallback en `lib/supabaseClient.ts` porque no son secretas (RLS las protege), pero usa el
`.env.local` para desarrollo.

## Estructura

- `app/` — páginas (App Router). Una carpeta por módulo: comercial, margen, stock, marketing, financiero.
- `components/` — componentes compartidos (nav, tarjetas de módulo).
- `lib/` — cliente de Supabase.
- `supabase/migrations/` — SQL exactamente igual al aplicado en el proyecto real de Supabase.
- `docs/` — requisitos del cliente, decisiones de arquitectura y backlog de tareas.
