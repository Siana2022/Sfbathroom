# AGENTS.md

Guía de trabajo para este repositorio. Plataforma BI de sfbathroom: Next.js 14
(App Router) + TypeScript + Supabase con RLS.

## Comandos

```bash
npm test           # 9 ficheros (compila con tsc y ejecuta con node)
npm run build      # build de producción
./node_modules/.bin/tsc --noEmit   # typecheck rápido, sin generar nada
npm run start      # servidor de producción en :3000
```

`npm test` usa `scripts/ejecutar-tests.mjs`: compila con `tsc` a `.test-build/`
y busca los ficheros compilados **por nombre**, porque `tsc` aplana la salida y
la ruta original se pierde. Al añadir un `.test.ts` no hace falta registrarlo en
ningún sitio, pero sí que sea un módulo con efectos en el nivel superior.

## Convenciones

- **Lógica pura fuera de los componentes.** Lo que se puede testear sin servidor
  ni React vive en `lib/comercial/*.ts` (por ejemplo `agenda.ts`, `cadencia.ts`).
  Vive ahí y no en `lib/datos/` porque `lib/datos/` importa `next/headers` y no
  puede entrar en un componente cliente.
- **Filtros por URL.** Los filtros se escriben en la URL con
  `useSearchParams` + `router.push`, para que el enlace sea compartible y el
  estado sobreviva a un refresco. Ver `components/SelectorFechas.tsx` y
  `components/FiltroModalidad.tsx`. Los componentes que los leen van envueltos en
  `<Suspense>`.
- **Todo parámetro de URL se normaliza** antes de usarlo
  (`normalizarRango`, `normalizarFiltroModalidad`): la URL la escribe el usuario.
- **Tokens de diseño, no colores literales.** `app/globals.css` define el
  sistema (monocromo con acento slate, Playfair Display + Lato). Usar
  `var(--accent)`, `var(--border)`, `var(--panel)`… Comprobar que un nombre de
  clase nuevo no existe ya antes de añadirlo.
- **Escritura con sesión del usuario.** Las mutaciones van por
  `/api/comercial/*` con `contextoDePeticion()`, que comprueba
  `puedeEscribir`. El RLS limita las filas a la cartera del comercial; para un
  comercial no hay que filtrar a mano.
- **El filtro de cartera de dirección sí se hace a mano.** Dirección elige un
  comercial (`?comercial=`) y `getPanelComercial` acota el panel por
  `clientes.comercial_id` en JS, tras la consulta: la cartera se define por el
  cliente, no por `facturas.comercial_id`, que no está relleno en todas las
  filas. Por eso el filtro se aplica al conjunto entero (KPIs, agenda,
  seguimiento y contactos) y no consulta a consulta.

## Trampas conocidas

- **`mcp/Instalar Windows.bat` aparece modificado** en `git status` por el
  atributo `*.bat text eol=crlf` de `.gitattributes`. No es un cambio real: no
  lo incluyas en los commits.
- **Las migraciones no se aplican solas.** Están en `supabase/migrations/` y hay
  que aplicarlas a mano. Se comprueba que una tabla existe (y está protegida por
  RLS) pidiéndola por HTTP: un 401 significa que existe y pide autenticación.
- **Un 401 al consultar una tabla es la señal de que existe.** No lo confundas
  con un fallo de despliegue.
- **Un `select` con una columna que no existe rompe la consulta entera.** Si
  añades un campo a `reuniones` en el código, la migración tiene que estar
  aplicada o la página falla en runtime, no solo en el build. No hay credenciales
  de base de datos en el entorno: la migración la aplica el usuario en el SQL
  Editor, y hasta entonces el smoke test contra Supabase no es posible.
- **Los usuarios demo de `docs/crear-usuarios-prueba.sql` no están creados** en
  el proyecto Supabase actual: el login por password da `invalid_credentials`.
  No sirven para verificar en vivo.
- **Verificar una migración sin credenciales de base de datos.** Pide la columna
  nueva por PostgREST con la publishable key: si existe, responde 401
  `permission denied for function auth_role` (la fila está protegida por RLS);
  si no existe, responde 400 `42703 column does not exist`. Ese contraste es la
  comprobación de que el SQL está aplicado.
- **`comerciales` es único por `(codigo_erp, empresa_id)`, NO por `codigo_erp`.** El
  mismo código existe en las tres empresas (SF/DOT/FUX): en los datos reales, el
  '4' es a la vez "STARBATH PLUS - ALBA RAJADELL" y "ESPAÑA - CARLOS TARAZONA".
  Un `where codigo_erp = '4'` devuelve varias filas, así que un
  `set comercial_id = (select id from comerciales where codigo_erp = '4')` revienta
  con "more than one row returned by a subquery". Filtra siempre por la pareja
  (o por `empresa_id`). La cartera además es por empresa: `getPanelComercial`
  filtra por `empresa_id` + `comercial_id`, y la empresa sale de la cookie
  `sfb_empresa` (por defecto 'SF').
- **`getCarteraComercial` (en `lib/datos/comercial.ts`) es código muerto.** La
  cartera real sale de `getPanelComercial`. Al tocar la cartera, mira cuál de las
  dos está en uso o te dejarás columnas sin cambiar.
- **RLS es por FILA, no por columna.** `clientes` solo lo escribe admin/direccion
  (`clientes_write`, 0001). No se puede abrir la fila "solo un poco": una política
  que deje al comercial actualizar su cliente le deja también `limite_credito` y
  `plazo_pactado_dias`. Para darle columnas sueltas, la vía son funciones
  `security definer` con la comprobación dentro (ver 0042): la tabla no se abre.
- **El estado CRM del cliente se escribe desde dos sitios**, no uno: el PATCH de
  `app/api/comercial/clientes/[id]/route.ts` y el PATCH de
  `app/api/comercial/reuniones/[id]/route.ts` (al cerrar una reunión). Si cambias
  cómo se guarda `estado_crm`, mira los dos.
- **Los errores de las funciones de 0042 se traducen con `errorDeFuncion`.** Un
  42501 (cliente fuera de la cartera) tiene que salir 403, no 400.
- **Un comercial puede llevar VARIAS carteras (0044).** `profiles.comercial_id` es
  una sola; las demás van en `perfiles_comerciales`. En A3ERP la misma persona
  aparece como un comercial distinto en cada empresa (Carlos Tarazona = SF 5/6/18/10,
  DOT 4/8/10, FUX 5/6/17/18), cada uno con su trozo de cartera. Por eso el RLS ya
  NO compara contra un uuid sino contra `auth_comercial_ids()` (conjunto): si
  escribes una política nueva para una tabla del comercial, usa
  `comercial_id in (select public.auth_comercial_ids())`, no `= auth_comercial_id()`.
- **En Supabase, `revoke ... from public` NO cierra una función a `anon`.** El
  esquema public trae execute concedido a anon/authenticated por defecto, y esa
  concesión explícita sobrevive al revoke de `public`. Hay que revocar de `anon`
  por su nombre. Cómo se detecta por PostgREST: si la función responde 401 con
  un mensaje que has escrito tú dentro, el cuerpo se está ejecutando (mal); una
  función que no existe da 404 `PGRST202`.

## Flujo de trabajo

- Rama de trabajo `feat/acceso-comercial`, PR #3.
- Antes de commitear: `npm test`, `tsc --noEmit` y `npm run build`.
- Al añadir tests a un módulo existente, seguir el estilo de `comprobar(nombre,
  condicion, detalle)` que ya usan los demás `.test.ts`.
