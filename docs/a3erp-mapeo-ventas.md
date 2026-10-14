# A3ERP · Contrato de mapeo (ventas A3ERP → Supabase)

Documento de referencia para la ingesta nocturna de ventas desde A3ERP.
Complementa a `ingesta/a3erp/README.md` y se apoya en la migración
`0019_ingesta_a3erp_ventas.sql`.

## Arquitectura

```
A3ERP (SQL Server, solo lectura)  ──►  runner nocturno  ──►  staging (a3erp.*)  ──►  swap atómico (a3erp.aplicar_ventas)  ──►  public.facturas / factura_lineas
```

Todos los pasos en una sola transacción por rango: si algo falla, no hay datos a medias.

## Origen real (validado contra SFBATHROOM, ago/2026)

No se usa el "cubo" del Power BI: se leen las mismas tablas que usa el cubo,
`CABEFACV` (cabeceras) + `LINEFACT` (líneas), más los maestros `ARTICULO` y
`REPRESEN`:

| Tabla | Papel |
| --- | --- |
| `CABEFACV` | Cabecera de factura de venta (SERIE, NUMDOC, TIPODOC, CODCLI, CODREP, FECHA, BASEMONEDA, TOTMONEDA, TOTDTOMONEDA, TOTALSUPLIDOSMON) |
| `LINEFACT` | Líneas, filtradas por `ESCOMPONENTE = 'F'` (mismo criterio que el cubo). Suma de `BASEMONEDA` de líneas = `BASEMONEDA` de cabecera (validado: 129 lín. ≡ 35.718,18) |
| `ARTICULO` | DESCART (nombre) por CODART · **CODART NO es único** → resolver con `OUTER APPLY (SELECT TOP 1 …)`, nunca `JOIN` (ver incidencia oct/2026) |
| `REPRESEN` | NOMREP (nombre del comercial) por CODREP · idem, `OUTER APPLY` |

Operativa por empresa: cada empresa del grupo tiene **su propia base de datos**
(SF→`SFBATHROOM`, FUX→`FUXSA`, DOT→`DOTSURFACE`); la consulta usa `{base}` y el
`--empresa` resuelto en `config/a3erp.config.json`.

## Particularidades del ERP (aprendidas en validación)

1. **`FECHA` es `datetime`** pero por defecto de sesión el servidor interpreta los
   literales en `dd/mm/aaaa`. Un literal ISO `'2026-08-01'` da
   *"conversión varchar en datetime fuera de intervalo"*. Por eso el filtro de rango
   fuerza `CONVERT(datetime, '{desde}', 120)` / `CONVERT(datetime, '{hasta}', 120)`.
2. **`TIPODOC` usa literales `Cargo` (factura) y `Abono` (rectificativa)** — ya vienen
   con signo (abono en negativo). Mapeo en `tiposDocumento` del config.
3. **Códigos con espacios**: `CODCLI`, `CODREP`, `CODART` llevan blanco → el SELECT
   aplica `LTRIM(RTRIM(...))`. Artículos sin codificar quedan como `CODART='0'`
   ("Articulo sin codificar").
4. **`NUMDOC` es `money`** → `CAST(... AS bigint)`.
5. No existen columnas `EJERCICIO`/`MES` en `CABEFACV` (se filtra por `FECHA`).
6. `PRCMEDIO` de `LINEFACT` = valoración línea (usa como `coste_unitario` provisional;
   el coste real vendrá de compras, D5).

## Incidencia (oct/2026): duplicación de líneas por fan-out en el JOIN de `ARTICULO`

**Síntoma**: `public.factura_lineas` tenía líneas repetidas (DOT 4.444 · FUX 2.007 · SF 121
= **6.572**), y con ellas el `base_imponible` de documento quedó inflado (la ingesta lo
calcula como Σ de bases de línea, ver `normalizar.ts:149-151`).

**Causa raíz**: la consulta de ventas usaba `LEFT JOIN [{base}].dbo.ARTICULO a ON a.CODART =
l.CODART`. Como `CODART` **no es único** en `ARTICULO`, cada línea se multiplicaba por el nº
de filas de ese artículo (fan-out). `normalizarRows` deduplica el **documento** (Map por
`numero_erp`) pero **no** las líneas, así que cada copia entraba como fila distinta
(`randomUUID()`). Evidencia: artículos como `295SEEMBA140` aparecían 12× con 11 repetidas,
mientras otros (`ZZLBM2MC`) no se duplicaban.

**No era** la anulación de facturas: la consulta trae `NULL AS NRO_ANULADA`, luego
`factura_anula_id` siempre es `NULL` y la "protección de anuladas" del swap nunca enlaza
(diagnóstico: `con_abono = 0`). Ese bug queda latente hasta que se mapee el nº de anulada.

**Arreglo** (`config/a3erp.config.json`): sustituir ambos `LEFT JOIN` de maestros por
`OUTER APPLY (SELECT TOP 1 …)` para no multiplicar filas:

```sql
LEFT JOIN [{base}].dbo.LINEFACT l ON l.IDFACV = c.IDFACV AND l.ESCOMPONENTE = 'F'
OUTER APPLY (SELECT TOP 1 r.NOMREP FROM [{base}].dbo.REPRESEN r
             WHERE r.CODREP = c.CODREP ORDER BY r.NOMREP) rep
OUTER APPLY (SELECT TOP 1 a.DESCART FROM [{base}].dbo.ARTICULO a
             WHERE a.CODART = l.CODART ORDER BY a.DESCART) art
```

**Limpieza de datos ya cargados** (`0024`/`0025`): `a3erp.deduplicar_lineas()` colapsa filas
exactamente iguales (mismo factura/artículo/cantidad/precio/coste/descuento/base); borró las
6.572 y dejó `a3erp.contar_lineas_duplicadas()` en 0. Las **cabeceras**, sin embargo, siguen
infladas y hay que recuadrarlas desde las líneas ya limpias:

```sql
update public.facturas f
set base_imponible = sub.base_lineas
from (
  select fl.factura_id, round(sum(fl.base_imponible),2) as base_lineas
  from public.factura_lineas fl
  group by fl.factura_id
) sub
where sub.factura_id = f.id and f.base_imponible is distinct from sub.base_lineas;
```

**Reparación autoritativa**: con el config corregido, re-ejecutar la ingesta en modo
reconciliación (las 3 empresas). El swap borra y recarga el rango, recuadrando cabeceras y
líneas. Mientras el config del PC (`C:\Apps\sfbathroom-ingesta`) no se actualice, cada
ingesta nocturna volverá a duplicar dentro de su ventana de 45 días.

## Contrato de campos

El runner espera una fila por **línea de documento** (cabeza + líneas del mismo
SELECT). Mapeo ERP → campo lógico en `config/a3erp.config.json` (`columnas`):

| Campo lógico | Origen | Notas |
| --- | --- | --- |
| `numero_erp` | `SERIE` + `NUMDOC` | Compuesto `{serie}-{nro}` (p.ej. `SF-260723`, `AS26-28`). Unidad con claves compuestas por empresa |
| `fecha` | `FECHA` | Filtro de rango con `CONVERT(...,120)` |
| `tipo_documento` | `TIPODOC` | Normalizado: `factura` (Cargo), `abono` (Abono), `nota_cargo` |
| `cliente_codigo` / `cliente_nombre` | `CODCLI` / `NOMCLI` | Auto-crea `clientes` si falta |
| `comercial_codigo` / `comercial_nombre` | `CODREP` / `REPRESEN.NOMREP` | Auto-crea `comerciales` |
| `base_imponible` / `total` | `BASEMONEDA` / `TOTMONEDA` | Con signo (abono negativo) |
| `portes` | `TOTALSUPLIDOSMON` | |
| `descuento_pie` | `TOTDTOMONEDA` | |
| `rappel_devengado`, `albaran_numero`, `factura_anula_numero` | (pendiente confirmar origen) | `0` / `NULL` por ahora |
| `articulo_codigo` / `articulo_nombre` | `CODART` / `ARTICULO.DESCART` | Auto-crea `articulos`; `CODART='0'` no codificado |
| `cantidad`, `precio_unitario` | `UNIDADES`, `PRECIO` | |
| `coste_unitario` | `PRCMEDIO` | Provisional hasta D5 |
| `descuento_pct` | `DESC1` | % de descuento de línea |

## Convenciones de datos (obligatorio)

1. **Abonos en negativo** (los da A3ERP con signo): `total`, `base_imponible`, etc. se
   guardan como vienen. La app suma `total` directamente; no hay segundo signo.
2. **`importe` de línea es generado** en Supabase (`cantidad × precio × (1 − desc/100)`).
3. **Idempotencia**: re-ejecutar un rango lo sustituye íntegro (swap por `empresa_id`
   + rango). Nunca duplica.
4. **Borrados**: un documento que ya no está en el rango se elimina (el swap lo hace
   implícito). Cron diario re-lee ventana móvil de 45 días; semanal rango completo.
5. **Multiempresa**: cada carga lleva `empresa_codigo`; el swap resuelve `empresa_id`.
   Las claves únicas son **compuestas por empresa** (`(codigo_erp, empresa_id)`,
   `(numero_erp, empresa_id)`) porque los códigos/numeración se repiten entre empresas.

## Medidas de referencia (validación ago/2026 en SFBATHROOM)

- 38 documentos: Cargo 34 (base 35.718,18 / total 41.466,46) · Abono 4 (base −209,89 /
  total −253,96). Neto base 35.508,29 / neto total 41.212,50.
- 134 líneas (129 Cargo + 5 Abono) — coincide con los 134 registros de la query loader.

## Go-live (oct/2026): reconciliación completa cargada y validada

Carga histórica completa SF + FUX + DOT realizada con `--modo reconciliacion` (troceado
por meses). Totales en producción según `v_perf_facturacion_mensual`:

| Empresa | Ejercicio | Facturas | Neta total (€) |
| --- | --- | --- | --- |
| SF | 2025 | 635 | 601.431,26 |
| SF | 2026 (YTD) | 866 | 1.236.724,83 |
| FUX | 2022–2026 | 31.279 | ~13,532 mil |
| DOT | 2024–2026 | 1.731 | ~6.953 mil |

- La diferencia de SF 2026 (+2.328,71 € vs la snapshot anterior del ERP) son facturas
  nuevas emitidas entre ambas consultas.
- Los ERP: SF solo tiene histórico desde **2025**; FUX desde **2022**; DOT desde **2024**.
- **Los datos demo del seed (facturas `F-…`, clientes `C-…`, artículos `A-…`,
  comerciales `COM-…`) se purgaron** de `facturas`/`factura_lineas`/`cobros`/`presupuesto`
  (catálogos quedaron como huérfanos hasta D3). El famoso 381.898,25 € del MCP era
  exactamente ese seed 2026.

### SQL de verificación (¡ojo al join!)

`sum(f.base_imponible)`/`sum(f.total)` **no debe ejecutarse en la misma query que hace
`join` a `factura_lineas`**: cada línea multiplica la cabecera y dispara las cifras.
Separar:

```sql
select e.codigo, count(f.id) as docs, round(sum(f.base_imponible),2) as neto_base,
       round(sum(f.total),2) as neto_total
from public.facturas f join public.empresas e on e.id=f.empresa_id
where e.codigo='SF' and f.fecha>='2026-08-01' and f.fecha<'2026-09-01'
group by e.codigo;

select count(distinct fl.id) as lineas
from public.factura_lineas fl
join public.facturas f on f.id=fl.factura_id
join public.empresas e on e.id=f.empresa_id
where e.codigo='SF' and f.fecha>='2026-08-01' and f.fecha<'2026-09-01';
```

## Discrepancias YTD oct/2026 vs Power BI del cliente (sin resolver)

El cliente reportó sus cifras de "facturación neta 2026" del Power BI: SF **1.062.820,66**,
DOT **1.385.170,57**, FUX **1.363.849,15**. La app suma 1.062.310,04 / 1.385.037,27 /
1.351.009,11. Diagnóstico (`ingesta/a3erp/diag.mjs`, ejecutado en el PC con VPN):

- **Las bases reales del ERP dan exactamente lo que suma la app**: `SFBATHROOM` 893 docs
  1.062.310,04 · `FUXSA` 236 docs 1.351.009,11 · `DOTSURFACE` 628 docs 1.385.037,27.
- `DBATHROOM` y `FUXSABANY_1` existen en el servidor pero están **vacías** (0 facturas
  2026) → el mapa `SFBATHROOM`/`FUXSA`/`DOTSURFACE` es correcto. `SALINAS_FURIO_INVEST`
  no es del grupo de ventas (20 docs, inversión).
- **Ningún candidato del ERP reproduce las cifras del cliente**: base, base+portes
  (`TOTALSUPLIDOSMON`=0 en todo), suplementos `ESCOMPONENTE='S'` (0), suma por líneas `F`,
  y las 11 columnas `FECHA%` de `CABEFACV` (todas dan ≤ lo que suma la app).
- **Conclusión**: el Power BI del cliente no se alimenta de esas tablas tal cual — o está
  anticuado (snapshot anterior), usa otro periodo, u otra medida (p. ej. "Importe" del
  cubo/PVM, no base imponible). Pendiente obtener del cliente: fecha de refresh + periodo,
  nombre de la medida, o el desglose mensual 2026 para comparar mes a mes.
- `diag.mjs` es solo lectura y no toca Supabase; sirve además de verificación del mapa de
  bases (imprime el scan de todas las DB del servidor).

## Vías pendientes con el cliente

- **Coste real** (D5): carga `v_coste_completo_por_lote` → `articulos.coste_unitario`
  y `factura_lineas.coste_unitario`; mientras tanto `PRCMEDIO` provisional.
- **Origen de `rappel_devengado`, albarán y rectificativa** en `CABEFACV` si se usan.
- **Maestros dedicados** (`clientes`, `articulos`, `comerciales` completos) — siguiente
  extensión; hoy se auto-crean desde el staging (fallback).

## Alcance futuro (este contrato solo cubre ventas)

- `cobros`, `stock_actual`, `pedidos`: módulos pendientes de contrato propio.