# A3ERP · Propuesta de decisiones para el equipo

Objetivo: apañar la integración A3ERP → Supabase (ventas, después el resto). El diseño
de fondo está validado: lectura del cubo de Ventas, cron nocturno, **ventana móvil
(45 d) + reconciliación semanal**, **staging + swap atómico**, `service_role` solo
server-side, abonos en negativo. Aquí solo quedan decisiones de ejecución.

---

## D1 — Acceso de red / dónde corre el runner (la decisión raíz)

| Opción | Cómo | Ventaja | Coste |
| --- | --- | --- | --- |
| **A) En su red** | Runner (script Node) en un PC/VPS dentro de la red del cliente | Sin puertos abiertos; llega directo al SQL Server | Una máquina que mantengan/den |
| **B) Túnel/VPN** | Tailscale y un agente en el servidor del ERP; runner en nuestro lado (VPS/laptop) | Control centralizado; webhook/estado en nuestro lado | Instalar un agente en su servidor (requiere su TI igualmente) |
| **C) Exportación CSV** | El ERP (si es escritorio) exporta informes programados a una carpeta/FTP | Sin acceso SQL ni red | Solo lo que A3ERP sepa exportar; menos fiable |

**Recomendación**: primero confirmar si A3ERP es **servidor** (SQL Server en red) o
**escritorio**. Si es servidor → **A** (más limpio) o **B** (más control). Las tres
requieren cooperación de su TI; la pregunta al cliente es la misma en todos los casos.

**Necesito tu decisión**: A, B o C como plan principal.

## D2 — Runner: script Node (ya construido) vs n8n

| Opción | Ventaja | Coste |
| --- | --- | --- |
| **Node script** (`ingesta/a3erp`, ya en el repo) | En repo, `mssql`+PostgREST, 0 infra extra, testeable, estado propio | Reintentos/alertas a implementar (ya está el esqueleto) |
| **n8n** | GUI, retries/alertas integrados | Otro servicio a hostear/mantener; no está desplegado |

**Recomendación**: arrancar con el **Node script**. Migrar a n8n solo si luego se
necesitan varios flujos visuales u operación desde una GUI.

**Necesito tu decisión**: arrancamos con Node script y dejamos n8n como evolución
posible (¿ok?).

## D3 — Alcance por fases

1. **F1 Ventas** (`facturas` + `factura_lineas`) — contrato ya escrito, migración 0019.
2. **F2 Maestros** — carga dedicada de `clientes`, `articulos`, `comerciales` (el swap
   auto-crea los que faltan al cargar ventas; una carga de catálogo es más limpio).
3. **F3 Cobros/vencimientos** (cartera, DSO, `v_saldo_clientes`) y luego **stock**.

**Recomendación**: F1 ya; F2 junto a F1 (un acceso/cubo más no cuesta). F3 después.

## D4 — Cadencia de la ventana móvil y reconciliación

- **Diaria**: ventana móvil de **45 días** (cubre retro-fechadas y ediciones).
- **Semanal** (domingo 06:00): reconciliación del histórico completo (detecta
  borrados/editados fuera de la ventana).
- Ajuste: si la query del cubo es lenta en su SQL Server, se baja la ventana a 30 días;
  si editan mucho en el pasado, se sube a 90.

**Necesito tu decisión**: 45 d / semanal como parámetros por defecto (¿ok?).

## D5 — Coste de artículo (para que el margen deje de ser 0)

La fuente no está clara aún. Opciones:
- **Maestro de artículos** (coste fijo) — simple, pero no captura fletes/imprevistos.
- **Compras** (`v_coste_completo_por_lote` ya existe) — coste real de llegada.

**Recomendación**: confirmar con el cliente la fuente; si es de compras, la carga de
F2/F3 la alimenta. Hasta entonces el margen queda a 0 sin afectar ventas/neto.

## D6 — Alertas y operación

- Conectar la salida del runner a la infra de alertas existente (Resend).
- Watchdog: si no hay corrida en 48 h → aviso. Recomendable desde el go-live.

## D7 — Validación de go-live

1. Aplicar la migración **0019** en Supabase producción.
2. Carga histórica completa (`reconciliacion`).
3. Comparar **mes a mes** con el Power BI actual (SF 2026 y 2025). Tolerancia 0.
4. Después: cron diario + reconciliación semanal + alertas.

---

## Orden de ejecución cuando el cliente responda

1. Confirmar servidor vs escritorio + cómo llegamos (**D1**).
2. Aplicar 0019 y verificar.
3. Rellenar `a3erp.config.json` con la query real del cubo + tipos de documento.
4. **Carga histórica → validación vs Power BI (D7)**.
5. Cron diario + reconciliación semanal + alertas (**D4/D6**).
6. Fases siguientes: maestros, coste, cobros, stock (**D3/D5**).

**Decisiones que únicamente necesito de ti: D1 (runner/red), D2 (Node vs n8n),
D4 (ventana). El resto es táctico y ya está definido.**