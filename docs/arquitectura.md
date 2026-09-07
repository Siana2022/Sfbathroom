# Arquitectura y decisiones técnicas

## Infraestructura desplegada

| Recurso | Valor |
|---|---|
| Supabase org | "Sfbathroom" (`emvloponqtbpuuzmkxkb`) |
| Supabase project ref | `dgbxualxhrbbqglvxtxq` |
| Región | `eu-central-1` |
| Postgres | 17.6 |
| Vercel project | `sfbathroom-bi` (cuenta personal, sin team) |

## Esquema de base de datos

Ver `supabase/migrations/0001_schema_inicial_sfbathroom.sql` (esquema base) y
`0003_esquema_cuadro_mando.sql` (alineación con la especificación del cuadro de mando
comercial). Resumen por módulo:

- **Multiempresa**: tabla `empresas` (`SF`, `DOT`, `FUX`) y columna `empresa_id` en todas las
  tablas operativas (datos históricos backfilleados a `SF`).
- **Comercial**: `facturas`, `factura_lineas` (con `importe` como columna generada),
  `clientes`, `comerciales`, `articulos`, `familias_articulo`. Ampliado con `tipo_documento`
  (factura/abono/nota_cargo), `factura_anula_id`, `desc_pie`/`portes`/`rappel`, `pedido_id`,
  canales, grupos empresariales, país/provincia, estado de cliente y límites de crédito.
- **Pedidos/cartera**: `pedidos`, `pedido_lineas` (con `cantidad_servida` y `importe`
  generado), `pedido_modificaciones`.
- **Margen por lote**: `compras` (flete/aduana/seguro/transporte interior/tipo de cambio) +
  `compra_lineas` (con `pct_roturas`) y la vista `v_coste_completo_por_lote` que reparte los
  costes de llegada por cantidad del lote. `v_margen_por_articulo` sigue como base histórica.
- **Stock**: `stock_actual` (snapshot por artículo/almacén, + `stock_reservado`),
  `stock_movimientos` (histórico), `almacenes`, `stock_en_transito`; vistas
  `v_consumo_diario` y `v_stock_cobertura` (cobertura en días, disponible y en tránsito).
- **Cobros/crédito**: `cobros` (con flag `impagado`); vistas `v_aging` (pendiente y días
  vencidos por factura) y `v_saldo_clientes`.
- **Calidad/devoluciones**: `incidencias` (roturas, defectos, errores de pedido/expedición,
  rechazo comercial).
- **Presupuesto**: `presupuesto` desglosado por ejercicio/mes/cliente/comercial/familia.
- **Alertas**: `alertas_config` (umbrales configurables) + `alertas_generadas`.
- **Marketing**: `marketing_canales`, `marketing_inversion`, `ventas_semanales` (variable
  objetivo para el MMM).
- **Financiero**: `financiero_cuentas_anuales` (balance/P&G/flujo de caja por partida),
  `financiero_kpis`.
- **Meta**: `fuentes_datos_config` (módulos ampliados a pedidos/cobros/devoluciones).

Todas las vistas nuevas usan `security_invoker = true` (como 0002 hizo con el margen) para
que la RLS del usuario que consulta se aplique siempre.

## Modelo de roles (RLS)

Tabla `profiles` con columna `role`: `admin`, `direccion`, `comercial`, `financiero`,
`lectura`, `administracion`, `almacen`. Funciones auxiliares `auth_role()` /
`auth_comercial_id()` (security invoker, `search_path` fijado) usadas en todas las políticas.

- `comercial`: solo ve sus propias facturas/líneas/clientes/pedidos/presupuesto (vía
  `comercial_id`); no ve compras ni cobros.
- `administracion`: ve cobros/cartera y puede registrar cobros y modificaciones de pedido;
  no ve compras ni márgenes.
- `almacen`: ve pedidos, stock, stock en tránsito y cobertura; no ve importes de compra ni
  cobros.
- `financiero`/`admin`/`direccion`: ven todo, incluido compras/margen y financiero/marketing.
- `lectura`: ve comercial/stock, no ve financiero ni marketing (confidencialidad).
- Escritura reservada a `admin`/`direccion` desde la app (y `administracion` para cobros y
  modificaciones de pedido); la ingesta automática usa la `service_role key`, que bypassa
  RLS por diseño de Supabase.

Advisors de seguridad de Supabase revisados y limpios tras la migración `0002`
(vista con `security_invoker`, funciones con `search_path` fijado, `handle_new_user` con
`execute` revocado para `anon`/`authenticated`).

## Integración con A3ERP (pendiente de ejecutar)

Investigación (ver conversación / búsqueda web) confirma que A3ERP:
- Corre sobre **SQL Server**, con generador de consultas SQL propio.
- Incluye un módulo de BI con **cubos multidimensionales predefinidos** (el de Ventas es el
  más documentado) — es casi seguro que el Power BI actual del cliente se conecta así:
  copiando la instrucción SQL del cubo y pegándola como consulta personalizada en el
  conector de SQL Server de Power BI.
- Existe un producto de pago aparte, **Link API | a3ERP**, con integración REST en tiempo
  real y documentación autogenerada — no hace falta activarlo porque el cliente confirmó
  que la actualización **diaria** es suficiente.

**Plan recomendado**: replicar el mismo acceso que ya usa Power BI (credenciales de solo
lectura a la base de datos SQL Server) desde un workflow de **n8n** que corra cada noche,
ejecute la(s) consulta(s) de los cubos relevantes (Ventas, y las que existan para stock) y
haga upsert en Supabase vía API REST con la `service_role key`.

**Bloqueante actual**: faltan los datos de conexión (servidor, base de datos, credenciales).
La vía más rápida para conseguirlos es abrir el `.pbix` actual del cliente → "Transformar
datos" → origen SQL Server, donde aparece el servidor y la base de datos configurados.
También hay que confirmar si el servidor es accesible solo dentro de la red del cliente
(necesitaría VPN o regla de firewall para la IP de n8n) o si ya hay alguna pasarela expuesta.

## Ingesta de financiero y marketing

Sin API en ningún caso. Ambos módulos se alimentarán mediante import periódico de ficheros
Excel (financiero: gestoría / A3 Contabilidad; marketing: hoja del departamento financiero
con >10 años de histórico). Aún no se ha diseñado el proceso concreto de import — candidato
razonable: subida manual a Supabase Storage + función que parsea y hace upsert, o nodo de
n8n que lea directamente el Excel si está en una ubicación accesible (SharePoint/Drive).

## Claves y seguridad

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: públicas, protegidas
  por RLS, van en el cliente.
- `service_role key`: nunca en este repo, nunca en el frontend. Solo en las credenciales del
  workflow de n8n (fuera de este repositorio).
- Acceso a la app: contraseña de inicio de sesión (Supabase Auth), un único usuario por
  ahora (el responsable de sfbathroom) con rol `admin`.
