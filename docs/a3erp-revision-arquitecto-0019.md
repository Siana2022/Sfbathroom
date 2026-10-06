# A3ERP · Revisión del otro arquitecto (Paso 3 del plan)

Paquete preparado tras validar la consulta real contra `SFBATHROOM` (ago/2026).
Se pide control de calidad antes de activar la ingesta nocturna en producción.

## Contenido del paquete

| Artefacto | Ruta |
| --- | --- |
| Migración | `supabase/migrations/0019_ingesta_a3erp_ventas.sql` |
| Migración (addenda) | `supabase/migrations/0020_ingesta_a3erp_rpc_publica.sql` |
| Consulta + mapeo + empresas + filtro | `ingesta/a3erp/config/a3erp.config.json` |
| Runner (multiempresa, troceo mensual) | `ingesta/a3erp/src/{vuelo,normalizar,config,sqlserver,supabase}.ts` |
| Contrato de mapeo actualizado | `docs/a3erp-mapeo-ventas.md` |
| Alta en PC de red | `docs/a3erp-ops-pc-red.md` |

## Addenda (oct/2026 · go-live)

- **`0020`**: PostgREST solo expone el esquema `public`, así que se añadieron wrappers
  `public.cargar_ventas(text,date,date,jsonb,jsonb,jsonb)` y `public.leer_estado(text)`
  (security definer, `search_path a3erp, public`, grants solo a `service_role`).
- **`--env-file` de Node**: `#` dentro de un valor sin comillas se interpreta como
  comentario → `MSSQL_PASSWORD` debe ir entre comillas (`"M152G#1q"`). Fue la causa real
  del "login failed" en el runner (PowerShell y `node mssql` conectaban bien).
- **`statement_timeout` de Supabase** (30 s): una reconciliación completa en una sola
  llamada RPC da `57014`. El runner ahora **trocea por meses** e invoca `cargar_ventas`
  por tramo (swap atómico por rango → idempotente).
- **Carga completa validada** SF+FUX+DOT y datos demo del seed purgados
  (`docs/a3erp-plan-implantacion.md`, Paso 6).

## Qué cambió respecto a la revisión anterior

1. **Claves únicas compuestas por empresa** en `clientes`, `articulos`, `comerciales`
   (`unique (codigo_erp, empresa_id)`) y `facturas` (`unique (numero_erp, empresa_id)`):
   los códigos y la numeración **se repiten entre empresas** (SF/DOT/FUX), había
   colisión garantizada.
2. **`comerciales.empresa_id`** añadido con backfill a SF (antes `codigo_erp` global).
3. **Consulta real del ERP** en el config: `CABEFACV` + `LINEFACT` (`ESCOMPONENTE='F'`)
   + `ARTICULO` + `REPRESEN`, over `{base}` por empresa. `numero_erp` = `{serie}-{nro}`.
4. **Filtro de rango** con `CONVERT(datetime, '{desde}', 120)` / `120` en `hasta`:
   el dateformat de sesión `dd/mm/yyyy` rompía los literales ISO (investigado en vivo).
5. `LTRIM(RTRIM())` sobre `CODCLI`/`CODREP`/`CODART`; `CODART='0'` = "sin codificar".
6. `aplicar_ventas` join-escala por empresa y `factura_anula_id` también por empresa.

## Puntos a revisar

- **Seguridad**: la función se ejecuta con `security definer`, `search_path` fijado a
  `a3erp, public` y `GRANT EXECUTE` solo a `service_role`. Confirmar RLS
  (`enable_row_level_security`) y que no haya brecha (el swap borra el rango anterior
  solo de la empresa que carga).
- **Idempotencia del swap**: sustitución atómica por `(empresa_id, FECHA)`; re-ejecución
  no duplica ni deja cabezas huérfanas (se borran cabeceras fuera del rango y las
  líneas de la empresa).
- **Contrato de mapeo** (config `columnas` + `tiposDocumento`): solo acepta `Cargo`→
  `factura`, `Abono`→`abono`; cualquier otro tipo caerá en `nota_cargo` o fallará.
- **`importe` de línea generado** (`cantidad × precio × (1 − descto/100)`): ni
  Supabase ni la app deben escribir ese cálculo duplicado.
- Legacy de la 0004/00050 → `detalle_saldo` no entra en este contrato (solo ventas).

## Verificación tras aplicar

```sql
select * from a3erp.estado;
select count(*) from public.facturas where fecha >= '2026-08-01' and fecha < '2026-09-01';
-- esperado: 38 docs · neto total 41.212,50 · línea 134 (SF)

-- Vistas de go-live (public)
select * from public.v_perf_facturacion_mensual order by 1,2,3;
```