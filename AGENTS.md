# AGENTS.md

Guía de trabajo para este repositorio. Plataforma BI de sfbathroom: Next.js 14
(App Router) + TypeScript + Supabase con RLS.

## Comandos

```bash
npm test           # 4 ficheros, 74 tests (compila con tsc y ejecuta con node)
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

## Flujo de trabajo

- Rama de trabajo `feat/acceso-comercial`, PR #3.
- Antes de commitear: `npm test`, `tsc --noEmit` y `npm run build`.
- Al añadir tests a un módulo existente, seguir el estilo de `comprobar(nombre,
  condicion, detalle)` que ya usan los demás `.test.ts`.
