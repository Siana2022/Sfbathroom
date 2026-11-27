# Registro de accesos · propuesta de alcance

> Estado: **propuesta, sin implementar**. Pendiente de decidir alcance con el cliente.
> Origen: traspaso del 27 nov 2026, punto 7 ("Registro de accesos (definir alcance)").

## 1. Para qué sirve (y para qué no)

El registro debe responder a preguntas concretas. Si no sabemos cuáles, acabamos guardando
todo y sin poder consultarlo. Las que tienen sentido en sfbathroom:

1. **¿Quién ha entrado y cuándo?** Por usuario, con fecha y hora.
2. **¿Quién ha exportado datos de clientes?** Facturación, cartera, listados de clientes.
   Es lo más sensible: un Excel sale del sistema y deja de estar protegido por RLS.
3. **¿Quién ha modificado datos a mano?** `/datos` permite CRUD genérico por tabla.
4. **¿Quién ha enviado emails de marketing y a qué segmento?** Trazabilidad ante el cliente
   final y ante una reclamación.
5. **¿Quién ha cambiado roles o dado de alta usuarios?** `/admin`.

**No** es una auditoría forense de cada cambio de fila: eso son triggers en todas las tablas,
coste alto y mantenimiento. Se propone solo para unas pocas tablas si el cliente lo pide
(fase 3).

## 2. Restricción técnica que condiciona el diseño

- El login es **cliente** (`app/login/login-form.tsx`, `supabase.auth.signInWithPassword`),
  así que no hay un punto servidor por defecto donde registrar el intento. Hay que añadir
  una llamada explícita tras el login/logout, o leer los eventos de GoTrue.
- El `middleware.ts` se ejecuta en **cada petición**. Registrar ahí todas las páginas
  generarían miles de filas al día sin valor («entró a /facturacion»), además de latencia.
  Por eso el registro se limita a **eventos discretos**, no a navegación.
- Supabase mantiene sus propios logs de Auth (`auth.audit_log_entries`, GoTrue). Sirven para
  «quién entró», pero no para acciones de la app, su retención la decide Supabase y no son
  consultables desde el rol `authenticated` sin una vista `security definer`. Conviene
  verificarlo en el proyecto antes de depender de él.
- Todo esto choca con **RGPD** en dos puntos: la IP y el email de intentos fallidos son datos
  personales. Hay que decidir si se guardan y con qué plazo (apartado 5).

## 3. Opciones de alcance

### Opción A · Mínima (solo autenticación) — ~0,5 día

Registrar login correcto, login fallido y logout.

- **Ventaja**: cubre la pregunta 1 y parte de la 5 (accesos fuera de horario, cuentas
  compartidas).
- **Límite**: no dice qué hizo cada usuario. No sirve para exportaciones ni ediciones.

### Opción B · Recomendada (autenticación + acciones sensibles) — ~1,5–2 días

Opción A más:

| Evento | Punto de instrumentación |
|---|---|
| `exportacion` | `DescargarExcel` / `BotonExportar` → endpoint `/api/accesos` con la vista y el nº de filas |
| `edicion_datos` | Server actions / `components/EditorDatos.tsx` (tabla y operación, sin el contenido) |
| `envio_marketing` | Envío de campaña (`app/api/marketing/...`) |
| `cambio_usuario` | `/admin` (alta, cambio de rol, asignación de cartera) |
| `login_fallido` | `login-form.tsx` (email intentado + motivo, sin contraseña) |

- **Ventaja**: cubre 1, 2, 3, 4 y 5. Es el mínimo defendible ante una reclamación por fuga de
  datos de clientes.
- **Coste**: una tabla, un endpoint de escritura, un helper en cliente y una página de consulta
  en `/admin`.

### Opción C · Completa (B + auditoría de cambios de datos) — ~4–6 días

Añade triggers `after insert/update/delete` en las tablas sensibles (`clientes`, `facturas`,
`profiles`, `objetivos_comercial`, `alertas_silenciadas`), guardando valores anteriores y
nuevos en JSON.

- **Ventaja**: responde «quién cambió este cliente y qué había antes».
- **Coste**: triggers que hay que mantener con cada cambio de esquema, más volumen, y riesgo de
  fugar datos personales en el JSON si no se filtran columnas.
- **Recomendación**: no ahora. Solo si el cliente lo pide tras ver la B.

## 4. Modelo de datos propuesto (opción B)

```sql
create table if not exists public.accesos (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  usuario_id uuid references auth.users(id) on delete set null,
  -- se guarda el email solo en intentos fallidos, donde no hay usuario_id
  email_intento text,
  accion text not null,          -- login, login_fallido, logout, exportacion, edicion_datos,
                                 -- envio_marketing, cambio_usuario
  entidad text,                  -- 'clientes', 'facturacion', 'campana', …
  detalle jsonb,                 -- mínimo: nº de filas, ids de tabla, resultado
  ip inet,                       -- decidir apartado 5
  user_agent text
);

create index if not exists idx_accesos_fecha on public.accesos (fecha desc);
create index if not exists idx_accesos_usuario on public.accesos (usuario_id, fecha desc);
create index if not exists idx_accesos_accion on public.accesos (accion, fecha desc);

alter table public.accesos enable row level security;

-- Append-only: solo service_role escribe; solo admin lee.
create policy accesos_admin_select on public.accesos
  for select using (public.auth_role() = 'admin');
```

Sin políticas de `update` ni `delete`: así nadie puede borrar su rastro desde la app. La purga
por retención se hace con un job con `service_role`.

El `detalle` **no** guarda datos de negocio (importes, nombres de cliente): solo identificadores
y conteos. Si se guardaran, la tabla pasaría a contener datos personales de terceros.

## 5. Retención, privacidad y quién lo ve

Decisiones que hay que cerrar antes de implementar:

1. **Plazo de conservación.** Propuesta: 12 meses para accesos y exportaciones; los intentos
   fallidos, 90 días. Pasado el plazo, purga automática por job.
2. **IP.** Propuesta: guardar solo la IP truncada (`/24` en IPv4) o no guardarla. La IP completa
   identifica a una persona y añade obligaciones (información, base jurídica). Para el uso
   previsto (detectar accesos raros) la truncada basta.
3. **Base jurídica.** Interés legítimo en seguridad de la información (art. 6.1.f RGPD). Hay que
   reflejarlo en la política de privacidad del cliente e informar a los usuarios de que se
   registran accesos y exportaciones.
4. **Quién consulta.** Propuesta: solo `admin`. `direccion` podría ver agregados sin detalle de
   otros usuarios, si el cliente lo pide.
5. **Dónde se consulta.** Página `/admin/accesos` con filtros por usuario, acción y rango de
   fechas, más export del propio registro. Nunca accesible al rol `comercial`.

## 6. Qué NO entra en la opción B

- Navegación página a página (volumen sin valor).
- Contenido de los cambios (eso es la opción C).
- Detección de anomalías en tiempo real (eso ya lo hace `anomalias.ts` sobre datos de negocio,
  no sobre accesos).
- Acceso al fichero que se exporta: se registra la exportación, no se guarda el Excel.

## 7. Plan si se aprueba la B

1. Migración `0095_accesos.sql` (tabla, índices, RLS, purga).
2. `lib/datos/accesos.ts` con `registrarAcceso()` (server, `service_role`) y lectura para admin.
3. Endpoint `POST /api/accesos` (sesión obligatoria; valida acciones permitidas).
4. Instrumentar: login/logout, exportaciones, `/datos`, envíos de marketing, `/admin`.
5. Página `/admin/accesos` + enlace desde Administración.
6. Job de purga (`lib/jobs/purgarAccesos.ts`, diario).
7. Pruebas: `npx tsc --noEmit` y `CI=true npm run build`; verificar que el rol `comercial` no
   puede leer la tabla ni la página.

## 8. Resumen para decidir

| | A | B (propuesta) | C |
|---|---|---|---|
| Responde «quién entró» | ✓ | ✓ | ✓ |
| Responde «quién exportó / editó / envió» | — | ✓ | ✓ |
| Responde «qué cambió» | — | — | ✓ |
| Esfuerzo | 0,5 d | 1,5–2 d | 4–6 d |
| Riesgo RGPD | bajo | medio (decidir IP y plazo) | alto (JSON con datos) |

Recomendación: **B**, con IP truncada, 12 meses de retención y lectura solo para `admin`.
