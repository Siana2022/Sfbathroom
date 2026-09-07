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
  región `eu-central-1`. `0001` y `0002` aplicadas en producción; la `0003` (cuadro de mando)
  la aplicó el cliente; la `0004` (fix recursión RLS + escalada de rol) está versionada y
  **pendiente de aplicar**. Ver `supabase/migrations/`.
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
- **Acceso**: escritorio primero; PWA para móvil en una fase posterior, no ahora.
- **Mantenimiento**: Siana Digital construye el proyecto; la gestión de altas/bajas de
  usuario la lleva el cliente (a día de hoy no hay panel de administración de usuarios — es
  tarea pendiente si el cliente lo pide).

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

1. **Aplicar la migración `0004_fix_recursion_y_escalada_roles.sql`** en el SQL editor de
   Supabase: corrige la recursión de RLS que rompía cualquier consulta de datos tras el login
   (`max_stack_depth`) y cierra la escalada de rol (antes cualquiera podía ponerse `admin`).
2. Crear los usuarios de prueba (`docs/crear-usuarios-prueba.sql`, un rol por usuario) y,
   tras validar, el usuario real del responsable con `profiles.role = 'admin'`. La matriz de
   visibilidad y el estado de la RLS están en `docs/usuarios-y-roles.md`.
3. Conector A3ERP → Supabase (workflow n8n, pendiente de credenciales de la base de datos SQL
   Server del cliente).
4. Carga de costes reales de artículo (vía `compras`/`compra_lineas`) para que el margen deje
   de ser cero.
5. Definir y cargar los KPIs financieros concretos.
6. Cargar histórico de inversión en marketing (Excel) para arrancar el MMM.
