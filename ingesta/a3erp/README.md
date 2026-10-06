# Ingesta A3ERP (ventas) — runner nocturno

Carga cada noche las ventas del cubo de Ventas de A3ERP (SQL Server) a Supabase.
Sigue el diseño acordado en `docs/a3erp-mapeo-ventas.md`: escritura en staging con
`service_role`, sustitución atómica del rango vía `a3erp.aplicar_ventas()` y detección
implícita de borrados dentro del rango.

## Requisitos

- Node 20+ (`npm install`).
- Migración `0019_ingesta_a3erp_ventas.sql` aplicada en Supabase producción.
- Configuración: copiar `.env.example` a `.env` y `config/a3erp.config.json` con:
  - la consulta real del cubo de Ventas (el `SELECT` que usa su Power BI),
  - el mapeo de columnas ERP → campos de staging,
  - el mapa de tipos de documento (factura/abono/nota de cargo).

## Modos

| Comando | Alcance | Cadencia |
| --- | --- | --- |
| `npm run diario` | Ventana móvil (45 días por defecto, `VENTANA_DIAS`) | Cada noche |
| `npm run reconciliacion` | Histórico completo desde `PERIODO_START` | Semanal |
| `npm run manual -- --desde 2024-01-01 --hasta 2026-09-22` | Rango arbitrario | Bajo demanda |

Primera puesta en marcha: un `reconciliacion` (carga histórica), y después `diario`.

## Convenciones de datos (contrato)

- **Abonos en negativo**: `total`, `base_imponible`, `portes`, `descuento_pie`,
  `rappel_devengado` se guardan con signo negativo para `abono`; positivos para
  `factura` y `nota_cargo`. La app y el MCP suman `total` directamente.
- **Idempotente**: re-ejecutar el mismo rango lo sustituye completo, sin duplicar.
- **Borrados**: un documento que desaparece del cubo en el rango vuelve a cargarse
  en esa ventana se borra de `facturas`/`factura_lineas` (dentro de la misma
  transacción). Las relaciones de anulación se reconstruyen por número de documento.
- El `importe` de línea es una columna generada en Supabase; no se escribe.

## Fallos

El proceso aborta con código ≠ 0 si algo falla (conexión, staging, swap). Conecta la
salida a la infraestructura de alertas por correo existente. Sin confirmación de
`aplicar_ventas` no hay datos en vivo: el swap es transaccional.