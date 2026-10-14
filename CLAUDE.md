# sfbathroom BI — contexto del proyecto

Este archivo es lo primero que debe leer Claude Code al abrir este repo. Resume el estado
real del proyecto (lo que ya existe en producción, no solo lo que hay en este repo) y las
decisiones tomadas con el cliente.

## Qué es esto

Plataforma de Business Intelligence a medida para **sfbathroom** (fabricante y distribuidor
de productos de baño), sustituyendo su Power BI actual. Cliente de Siana Digital.

Módulos:
1. **Comercial** — facturación, artículos, comerciales, análisis de venta (filtros por rango
   de fechas, comercial, artículo).
2. **Margen por producto**.
3. **Stock** (en la práctica: actualización diaria, no hace falta tiempo real estricto).
4. **Marketing Mix Modeling** — solo canales offline (comerciales, call center, ferias).
5. **Financiero** — cuentas anuales, flujo de caja, balance + KPIs (hoy no calculan ninguno).

## Stack

- **Next.js 14** (App Router, TypeScript) — este repo.
- **Supabase** (Postgres + Auth + RLS) — proyecto ya creado y con el esquema aplicado.
- **Vercel** — hosting. Ya hay un despliegue preview funcionando.
- Integración de datos: previsiblemente **n8n** (nightly batch), no una API propia.

## Estado real de la infraestructura (fuera de este repo)

- **Supabase**: org "Sfbathroom" (`emvloponqtbpuuzmkxkb`), proyecto `dgbxualxhrbbqglvxtxq`,
  región `eu-central-1`. Migraciones `0001`–`0007` aplicadas en producción por el cliente
  (0001, 0002 vía CLI/dashboard; 0003–0007 pegadas a mano en el SQL editor, fuera del flujo
  `db push` — el registro `supabase_migrations.schema_migrations` solo conoce 0001–0002, hay
  deriva H-2 pendiente de `supabase migration repair`). Ver `supabase/migrations/`.
  URL: `https://dgbxualxhrbbqglvxtxq.supabase.co`.
- **Vercel**: proyecto `sfbathroom-bi` bajo la cuenta personal conectada (sin team todavía).
  Hay un deployment preview ya generado con el esqueleto de páginas de este repo.
- La clave `anon`/`publishable` de Supabase **no es secreta** (protegida por RLS) y puede ir
  en el cliente. La `service_role key` **nunca** debe usarse desde el frontend — solo desde
  procesos de ingesta (n8n, scripts server-side).

## Decisiones ya cerradas con el cliente (no las reabras sin motivo)

- **Frecuencia de actualización: diaria**. No hace falta tiempo real ni para stock ni para
  facturación, al menos en esta fase.
- **Volumen**: 3.000–5.000 facturas/año. 3 almacenes.
- **A3ERP** (ERP del cliente) corre sobre **SQL Server** y tiene un módulo de BI propio con
  "cubos" predefinidos (el de Ventas es el que ya usa su Power BI actual). La vía de
  integración recomendada — y la más barata — es replicar esa misma conexión: acceso de
  solo lectura a la base de datos SQL Server + la consulta SQL del cubo de Ventas, ejecutada
  desde un workflow de n8n cada noche, que vuelca a Supabase vía `service_role key`.
  Existe una alternativa oficial de pago ("Link API | a3ERP", tiempo real vía REST) que NO
  hace falta activar de momento porque la actualización diaria es suficiente.
- **Contabilidad**: sin API. Parte en A3ERP, parte en Excel de la gestoría. Cierre mensual.
  Cargar 3–5 ejercicios históricos. Ningún KPI financiero calculado hoy — hay que construirlos
  todos desde cero (liquidez, EBITDA, DSO, endeudamiento, etc., a validar con el cliente).
  Ingesta prevista: import periódico desde Excel, no conector API.
  **Ver detalle completo de respuestas del cliente en `docs/requisitos-cliente.md`.**
- **Marketing**: solo canales offline + ferias. Más de 10 años de histórico en Excel del
  departamento financiero — buena base para el MMM, pero la fuente es Excel, no una API de
  Ads.
- **Usuarios**: de momento un único usuario (el responsable de sfbathroom), con contraseña.
  El resto de roles se activan más adelante. El modelo de 7 roles ya está implementado en RLS:
  `admin`, `direccion`, `comercial` (solo ve lo suyo), `financiero`, `lectura`,
  `administracion` (cobros y cartera), `almacen` (stock y servicio).
- **Acceso**: escritorio primero; PWA para móvil en una fase posterior, no ahora. **Nota**:
  el cliente pidió la PWA en 2026-09-07 y está implementada (manifest + service worker).
- **Mantenimiento**: Siana Digital construye el proyecto; la gestión de altas/bajas de
  usuario la lleva el cliente (a día de hoy no hay panel de administración de usuarios — es
  tarea pendiente si el cliente lo pide).

## Auditoría de seguridad (7 sep 2026) · estado

Auditoría técnica externa contrastando repo vs producción `dgbxualxhrbbqglvxtxq`:
- H-1 (crítico, 5 vistas con RLS saltada) → **resuelto**: `0007` aplicada por el cliente, las
  6 vistas muestran `security_invoker=true`. No reabrir.
- H-2 (deriva `schema_migrations`: solo 0001–0002 registradas) → **pendiente**:
  `supabase migration repair --status applied 0003 0004 0005 0006` cuando se use el CLI.
  Ojo: el miedo original a duplicar seeds de la 0006 no aplica (la 0006 ya lleva `ON CONFLICT`).
- H-3 (bajo, `auth_role`/`auth_comercial_id` llamables por RPC) → **pendiente**, diferido:
  moverlas a esquema `private` toca todas las políticas RLS.
- H-4 (bajo) → **pendiente**: activar Leaked Password Protection en Supabase Auth (un clic).
- H-5 (bajo, action CI con tag móvil) → **resuelto**: `opencode.yml` fijado a SHA
  `02a167e048d3bd7299225068d79e4fce5c830d67` (v1.18.29).
- Los usuarios que el cliente creó en Authentication → Users sí se materializan en `profiles`
  vía trigger `on_auth_user_created`; solo falta asignar rol/cartera
  (`docs/asignar-roles-usuarios.sql`, emails a rellenar).

## Asistente BI (prototipo, set 2026)

Chat flotante en la app (`ChatIA` componente, `app/api/chat/route.ts`, `lib/agente/`).
El usuario pregunta en español; el agente usa herramientas que ejecutan consultas
RLS-scoped (misma sesión que el resto de la app) y responde con los datos reales.
Requiere la variable de entorno `ANTHROPIC_API_KEY` en Vercel (Server-only).
Modelo por defecto: `claude-sonnet-4-5` (configurable con `CHAT_MODEL`).
Detalle completo: `docs/asistente-ia.md`. Tools actuales: `ventas_por_mes`,
`evolucion_anual`, `top_clientes`, `desglose_variacion`, `detalle_clientes`,
`clientes_impagados`.

## Convenciones de este repo

- Nombres de tablas, columnas, rutas de la app y contenido visible al cliente: **en
  español**, siguiendo lo ya usado en el esquema (`facturas`, `factura_lineas`, `comerciales`,
  `v_margen_por_articulo`, etc.). No traduzcas al inglés a mitad de proyecto.
- Cualquier migración nueva va en `supabase/migrations/` con prefijo numérico incremental
  (`0003_...`, `0004_...`) y se aplica también contra el proyecto real de Supabase (usar el
  MCP de Supabase, project_id `dgbxualxhrbbqglvxtxq`) — este repo debe reflejar siempre lo
  que hay desplegado, no divergir de ello.
- Todas las tablas nuevas llevan RLS activado desde el primer momento, siguiendo el patrón
  de `auth_role()` / `auth_comercial_id()` ya definido.
- La ingesta desde fuentes externas (A3ERP, Excel de marketing/financiero) es responsabilidad
  de procesos aparte (n8n), no de esta app Next.js. Esta app es solo la capa de presentación
  + auth, que lee de Supabase con RLS.

## Qué falta (ver `docs/tareas-pendientes.md` para el detalle)

1. Asignar rol/cartera a los usuarios del responsable (rol `admin`) y demás perfiles
   (`docs/asignar-roles-usuarios.sql`, emails a rellenar). Existe `/admin` (solo admin, vía
   RPC `admin_listar_usuarios()` de la migración `0008` (security definer + gated)) que lista
   email/rol/cartera.
2. Conector A3ERP → Supabase (workflow n8n, pendiente de credenciales de la base de datos SQL
   Server del cliente).
3. Carga de costes reales de artículo (vía `compras`/`compra_lineas`) para que el margen deje
   de ser cero.
4. Validar KPIs financieros propuestos (página `/financiero`, incluye DSO en vivo) y cargar
   cuentas anuales desde Excel de la gestoría.
5. Cargar histórico de inversión en marketing (Excel) para arrancar el MMM (proceso
   documentado en `/marketing`).
6. Auditoría pendiente: H-2 (repair de migraciones), H-3 (esquema privado), H-4
   (leaked password protection — instrucciones en `docs/tareas-para-usuario.md`).
7. Alertas por correo: infra lista (`app/api/alertas/enviar/route.ts`, `lib/datos/email.ts`
   Resend, log `alertas_correos_enviados` en `0008`); falta `RESEND_API_KEY`,
   `ALERTAS_EMAIL_TO`, `ALERTAS_CRON_SECRET` y programar el cron.
8. **Edición manual de datos**: página `/datos` (`components/EditorDatos.tsx`) con CRUD
   genérico por tabla para admin/dirección mientras no llegue A3ERP. Requiere la migración
   `0009` (políticas write en facturas/líneas/stock/marketing/financiero + RPC
   `admin_columnas_tabla(text)`). Gating por rol en la página; RLS en cada tabla.
9. Todos los pendientes que dependen del cliente están recopilados en
   `docs/desbloqueos-cliente.md` (B4 fotos stock, B8 impagos/seguro de crédito, marketing,
   financiero, A3ERP, datos DOT/Fuxsabany para la consolidada holding).

## Última sesión (14 oct 2026) · arreglo de unidades + ingesta automática en el PC

- **Desvío de unidades (resuelto)**: la app mostraba menos unidades que A3ERP. Causa raíz:
  el parche `0025_ingesta_dedup_lineas.sql` (`a3erp.deduplicar_lineas()`) borró **líneas
  legítimamente repetidas** (misma factura+artículo+cantidad+precio+base) → se perdían
  unidades y base de línea (la neta no se movía porque sale de la cabecera). El fix bueno
  era la consulta sin fan-out (`OUTER APPLY`, ya en `610127f`) + **no** deduplicar.
- **Solución aplicada en el PC**: copiado `config/a3erp.config.json` (OUTER APPLY) y
  `src/normalizar.ts` (rellena `base_linea`), y `npm run reconciliacion` de las 3 empresas
  **sin** volver a ejecutar el dedup. SF 1555 docs · FUX 34022 · DOT 1843. Base de línea de
  FUX rellenada → margen de FUX deja de salir a ~0.
- **Verificado contra el ERP** con `ingesta/a3erp/diag-unidades.mjs` (nuevo, solo lectura):
  `M1` (TIPODOC `Cargo` + `ESCOMPONENTE='F'`) = **app exactamente** (Δ0 en las 3). `M5`=0 →
  `normalizar.ts` no descarta líneas; `M1`=`M2` → no hay suplementos (`'S'`). Unidades 2026
  a 14-oct: SF 35.071 · FUX 31.404 · DOT 15.133.
- **El "objetivo" (33.816/14.648/30.712) no era desvío**: eran mediciones de A3ERP
  **filtradas hasta el 5-oct**; la app iba hasta el 14-oct. La diferencia es lo facturado del
  6 al 14 (1.255/692/485). No hay nada que igualar.
- **Ingesta automática en el PC** (`ingesta/a3erp/bin/`, `.bat` con CRLF vía `.gitattributes`):
  `ingesta-diaria.bat` (ventana móvil 45 días, SF+FUX+DOT en serie) e `ingesta-semanal.bat`
  (reconciliación completa). `programar-tareas.bat` registra `sfbathroom-Ingesta-Diaria`
  (L–S 22:00) y `sfbathroom-Ingesta-Semanal` (domingos 22:00). Logs por día en
  `ingesta\logs\`. **Probado en el PC: SF OK → FUX OK → DOT OK → FIN**.
- **Aviso por correo si falla** (nuevo): endpoint `app/api/jobs/aviso-ingesta` (bajo
  `/api/jobs/*` para reutilizar `JOBS_CRON_SECRET`; envía vía `enviarEmail`) +
  `ingesta/a3erp/src/notificar.mjs` (lo llama el `.bat` solo si una empresa falla). **Pendiente
  real: verificar el dominio `sfbathroom.com` en Resend** (Resend responde
  `403 The sfbathroom.com domain is not verified`). Destinatario `ALERTAS_EMAIL_TO` =
  `asalinas@sfbathroom.com`, remitente `RESEND_FROM` = `alertas@sfbathroom.com`, todo ya en
  Vercel. Mientras no se verifique, el fallo solo queda en el log (no rompe la tarea).
  El DNS lo lleva el cliente en **Hostinger** (los 3 registros de Resend van en `send` y
  `resend._domainkey`, nunca en la raíz → no tocan web ni correo existente).
- **Pendiente menor**: el `.bat` escribe el log en una codificación que PowerShell muestra con
  mojibake (`â†'`); es cosmético, no afecta a los datos.

## Última sesión (06 oct 2026) · go-live ingesta A3ERP + selector de empresa

- **Go-live ingesta A3ERP**: carga histórica completa SF/FUX/DOT cargada y validada en
  producción (0019+0020 aplicadas, runner troceado por meses, password MSSQL entre
  comillas por el `#` de Node `--env-file`). Datos demo del seed purgados. Detalle:
  `docs/a3erp-plan-implantacion.md`, `docs/a3erp-mapeo-ventas.md` (tabla go-live).
- **Selector de empresa sin recarga**: `Header.tsx` ahora hace `router.replace(pathname)`
  al cambiar empresa → los server components (que leen la cookie `sfb_empresa`) se
  re-renderizan sin recarga completa (y se limpian los filtros de la empresa anterior).
  La caché `memo` de portada ya escala por empresa en la clave.
- **Indicador de frescura arreglado**: `FrescuraDatos` + `app/api/frescura` devolvían
  null (dependían de `jobs_ejecutados` del cron de la app). Ahora muestran por empresa la
  última fecha con facturas cargadas (`max(fecha)` sobre `facturas`, con RLS), píldora
  coloreada según antigüedad, siempre visible en la cabecera.
- **Neta = base imponible (semántica)**: la app mostraba `facturas.total` (TOTMONEDA, con
  IVA+suplidos) como "facturación neta"; Power BI del cliente usa base imponible
  (BASEMONEDA). Se alineó toda la app a `base_imponible` (vista `v_perf_facturacion_mensual`
  recreada en `0021_neta_base_imponible.sql`, y `lib/datos/*` que suman neta de venta:
  facturacion, vistas, miDia, actividad, desvioPresupuesto, clientes, concentracion,
  kpiEval netas/ticket/devoluciones, fichaCliente netas, pedidos, calidad, alertas,
  jobs anomalias/informe/reunirResumen y agente+MCP). Se conserva `total` (con IVA) en:
  cobros/cartera y DSO (saldos con IVA), documentos (detalle de documentos) y los importes
  por documento de fichaCliente. `getVariacion` ya calculaba sobre importe de línea (base),
  con lo que ahora sí cuadra con la cabecera.
- **Discrepancias 2026 vs Power BI del cliente (investigadas, pendientes del cliente)**:
  el cliente reportó SF 1.062.820,66 / DOT 1.385.170,57 / FUX 1.363.849,15; la app y el ERP
  (SFBATHROOM/FUXSA/DOTSURFACE) dan idéntico 1.062.310,04 / 1.385.037,27 / 1.351.009,11.
  Con `ingesta/a3erp/diag.mjs` se descartaron: portes/suplidos (0 en todo), suma por líneas
  `F`, y las 11 columnas de fecha de `CABEFACV`. `DBATHROOM`/`FUXSABANY_1` existen vacías
  (mapa de bases correcto). **Ninguna medida/fecha/base del ERP reproduce las cifras del
  cliente** → su Power BI debe estar anticuado, usar otro periodo o medida distinta de la
  base imponible. Pendiente: que el cliente confirme fecha de refresh, medida y/o de mes en
  mes (detalle en `docs/a3erp-mapeo-ventas.md`). `0021_neta_base_imponible.sql` sigue
  pendiente de aplicar en Supabase.

## Última sesión (15 sep 2026) · optimización de rendimiento P1–P5

Plan de rendimiento cerrado con el cliente (spec P1–P5). Estado:

- **P1 ✓ aplicado**: `vercel.json` con `"regions": ["fra1"]` (Frankfurt, cerca de Supabase
  `eu-central-1`). `vercel.json` también define los crons `resumen-diario` (0 7 * * *) y
  `informe-semanal` (0 6 * * 1).
- **P4 ✓**: consultas en paralelo con `Promise.all` en `getFacturacion`, `getVariacion`,
  `getMargen`, `getConcentracion`, `getRiesgoProveedorList` (dentro de `concentracion.ts`) y
  portada (`app/page.tsx` paraleliza `getFacturacion` + `getKpisPersonalizadosVistos` +
  `getResumenHoy`).
- **P2 ✓**: caché en memoria `lib/perf/memo.ts` (Map con TTL 15 min, clave prefijada por uid
  → NO filtra entre roles con RLS). Aplicado en portada a facturación y KPIs. Importante: no
  usar `unstable_cache` con `cookies()` (las funciones de `lib/datos/*` leen sesión) — la
  clave de caché no incluye el header `Authorization`, por eso memo por uid es la vía segura.
- **P3 ✓ (código) / ⚠ pendiente aplicar**: migración `0018_perf_facturacion_mensual.sql` crea
  la vista `v_perf_facturacion_mensual` (`security_invoker = true`): neta, nº facturas y
  unidades por (empresa, ejercicio, mes). `getFacturacion` la usa solo sin filtros con
  fallback si la vista no existe (no rompe prod). **El cliente debe aplicar la 0018 en el SQL
  editor de Supabase.**
- **P5 ✓**: KPIs de portada limitados a 8 (`MAX_KPI_PORTADA` en `app/page.tsx`) y evaluados en
  paralelo.

Pendiente para la próxima sesión:
- **16 sep 2026 ✓**: eliminado `force-dynamic` redundante (33 rutas) — Next lo detecta por
  `cookies()`.
- **16 sep 2026 ✓**: corregido middleware para el cron: antes redirigía a `/login` cualquier
  `/api/jobs/*` sin sesión, así que Vercel Cron (solo `Authorization: Bearer secret`) recibía
  307 y no ejecutaba nada. Ahora `/api/jobs/*` pasa si lleva `JOBS_CRON_SECRET` (cabecera o
  `?secret=`); `/api/jobs/jobs` es público. Verificado contra producción: el job
  `resumen-diario` responde `ok`.
- Env vars Vercel: `JOBS_CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Config, no secret), `RESEND_*`/`ALERTAS_*` y
  `ANTHROPIC_API_KEY` a cargo del cliente. Cliente añadió `SUPABASE_SERVICE_ROLE_KEY`.
- Migraciones 0001–0018 aplicadas por el cliente.
- Retirar provisional de fuerza bruta: `memo` por uid en portada ya da caché segura; no tocar
  `unstable_cache` con `cookies()`.
- Bugs previos cerrados y pusheados: export `dynamicForce` inválido en `mi-panel`,
  auditoría de cálculo (`fichaCliente`, `miDia`, `crosssell`, `buscar`, `alertas`, `stock`,
  `anomalias`), y saneo de búsqueda (`lib/buscar.ts` — `sanearTermino(q)` usado por
  `/api/buscar` y `/buscar`; causa del 500 por fallbacks `?? ''` y comas en la consulta).
- Comandos de verificación antes de push: `npx tsc --noEmit` y `CI=true npm run build`.
