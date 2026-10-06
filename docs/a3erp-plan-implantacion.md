# A3ERP · Plan de implantación (accionable)

Decisiones ya tomadas: **D1-B** túnel Tailscale como vía ideal de acceso desde nuestra
parte (requiere permiso de TI) — mientras tanto la operativa real usa un **PC de la
red** con la ingesta Node · **D2** Node script · **D3** maestros antes que ventas en la
misma corrida · **D4** ventana 45 d diaria + reconciliación semanal (configurable) ·
**D5** coste desde compras · **D7** validación mes a mes vs Power BI (tolerancia 0,
conciliando redondeos).

Estado: ✅ hecho · 🔄 en curso · ⏳ bloqueado por terceros/acción del cliente

---

## Paso 1 · Acceso de red (camino crítico) 🟡
- **1.1** Leer el ERP desde un PC de la red: ✅ (validado en vivo con `siana` +
  `SERVER\A3ERP`, bases por empresa `SFBATHROOM`/`FUXSA`/`DOTSURFACE`; alta operativa en
  `docs/a3erp-ops-pc-red.md`).
- **1.2** Tailscale/agente en el servidor (D1-B): ⏳ si TI lo permite, se migra el runner
  a nuestra parte sin cambiar código.

## Paso 2 · Adaptar el código a las decisiones 🔄
- **2.1 acontecimientos**: `0019_ingesta_a3erp_ventas.sql` ✅ escrito (staging ventas +
  `a3erp.aplicar_ventas` con **swap atómico por empresa** y **claves únicas compuestas
  `(codigo_erp, empresa_id)` / `(numero_erp, empresa_id)`** + `comerciales.empresa_id`
  backfill SF). Pendiente: **tablas de staging de maestros + `a3erp.aplicar_maestros()`
  (D3)** — el auto-creado desde staging de ventas sigue siendo fallback.
- **2.2** Loader `ingesta/a3erp/`: ✅ refactor multiempresa + **consulta real del ERP**
  en `a3erp.config.json` (`CABEFACV`+`LINEFACT`+`ARTICULO`+`REPRESEN`, `{base}`,
  `{RANGO}`, `CONVERT(...,120)`, `LTRIM(RTRIM)`), `numero_erp` compuesto
  `{serie}-{nro}`, `tiposDocumento` corregido (`Cargo`→factura, `Abono`→abono).
  Pendiente: consultas de catálogos (maestros) + `aplicar_maestros` en `supabase.ts` +
  `vuelo.ts` F2-antes-de-F1.
- **2.3** Docs: ✅ `docs/a3erp-mapeo-ventas.md` actualizado (origen real, filtro 120,
  claves por empresa, medidas de validación). ✅ `docs/a3erp-ops-pc-red.md` (alta en PC
  de red + tarea programada).
- Checkpoint: `npx tsc --noEmit` ✅ · `CI=true npm run build` (app) ✅ según QA.

## Paso 3 · Revisión del otro arquitecto (Paso 3) 🔄
Paquete preparado en `docs/a3erp-revision-arquitecto-0019.md` (0019 + config + loader).
Remitirlo y aplicar feedback. ✅ listo para enviar · ⏳ fecha de revisión del arquitecto.

## Paso 4 · Migraciones aplicadas en producción ✅
- **`0019_ingesta_a3erp_ventas.sql`** ✅ aplicada en el SQL Editor
  (`dgbxualxhrbbqglvxtxq`): esquema `a3erp.*`, `a3erp.aplicar_ventas` (swap atómico por
  empresa+rango), claves compuestas `(codigo_erp, empresa_id)`/`(numero_erp, empresa_id)`
  y `comerciales.empresa_id`. Reescrita idempotente (crea/backfillea `empresa_id` antes
  de las constraints).
- **`0020_ingesta_a3erp_rpc_publica.sql`** ✅ aplicada: como PostgREST solo expone
  `public`, expone `public.cargar_ventas(...)` y `public.leer_estado(...)` (security
  definer, grants solo a `service_role`). Verificadas HTTP 200.

## Paso 5 · Configuración con datos reales ✅ (salvo rotación de clave)
- **5.1** Consulta real del ERP ya incorporada al config (validada, ago/2026).
- **5.2** `columnas` + `tiposDocumento` + `empresas` + `filtroFecha` ✅.
- **5.3** `.env` ✅ (MSSQL, SUPABASE, EMPRESA_CODIGO=SF, VENTANA_DIAS, LOTE_SIZE).
  Pendiente: **rotar `SUPABASE_SERVICE_ROLE_KEY`** y propagarla a `.env` del PC.

## Paso 6 · Primera carga + validación (D7) ✅ (go-live oct/2026)
1. `npm run reconciliacion` (histórico desde `PERIODO_START=2022-01-01`) ✅ — troceado
   por meses para no chocar con el `statement_timeout` de Supabase.
2. Carga completa **SF + FUX + DOT** validada contra el ERP (2026 SF total
   1.236.724,83 €, en línea con la snapshot 1.234.396,12 del ERP + facturas nuevas).
   Ver `docs/a3erp-mapeo-ventas.md` (tabla go-live y SQL de verificación).
3. **Entrega**: purgados los datos demo del seed (facturas/cobros/presupuesto) — el MCP
   ahora lee datos reales. Pendiente conciliación fina mes a mes vs Power BI de FUX/DOT.
- Referencia validada en origen (ago/2026): 38 docs · neto base 35.508,29 ·
  neto total 41.212,50 · 134 líneas.

## Paso 7 · Cadencia y operación 🔄
- Cron diario **06:00** → `diario.bat` (SF+FUX+DOT en secuencia; `docs/a3erp-ops-pc-red.md`)
  en el PC de red. ⏳ pendiente de confirmar la tarea `schtasks /Create` en el PC.
- Alertas Resend + watchdog (sin corrida en 48 h): ⏳ `RESEND_API_KEY`,
  `ALERTAS_EMAIL_TO`, `ALERTAS_CRON_SECRET` + job del cron que comprueba `a3erp.estado`.
- Revisar `a3erp.estado` tras cada corrida (clave `ventas`, último tramo via
  `public.leer_estado('ventas')`).

## Paso 8 · Siguientes fases (no bloquean lo anterior) 🔄
- **D3 maestros** (staging + `aplicar_maestros` + vuelo F2→F1) + retirar catálogos demo
  huérfanos (`C-…`, `A-…`, `COM-…` que ya no referencia ninguna factura).
- **Coste (D5)**: `v_coste_completo_por_lote` → `articulos.coste_unitario` y
  `factura_lineas.coste_unitario`.
- **Cobros/vencimientos**: cartera + DSO (`cobros`, alimenta `v_saldo_clientes`).
- **Stock**: `stock_actual` / `stock_movimientos`.
- **Reconciliación fina mes a mes vs Power BI** para FUX y DOT (nuevos volúmenes: FUX
  2026 solo 216 facturas YTD — confirmar si FUXSA cambió de numeración/base).

---

## Próxima acción inmediata (depende del usuario/cliente)
1. **Crear la tarea diaria** en el PC (`schtasks /Create /TN "A3ERP-Ventas-Diario" /SC
   DAILY /ST 06:00 /TR "C:\Apps\sfbathroom-ingesta\diario.bat"`) y probar con
   `schtasks /Run`.
2. **Remitir el paquete del Paso 3** al otro arquitecto (incluye 0020).
3. **Reconciliación fina**: SF/FUX/DOT mes a mes vs Power BI (nueva capacidad).
4. **Rotar `SUPABASE_SERVICE_ROLE_KEY`** y propagarla al `.env` del PC.
5. Watchdog/Resend (RESEND_API_KEY, ALERTAS_EMAIL_TO, ALERTAS_CRON_SECRET) + job cron.