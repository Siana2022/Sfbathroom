# Usuarios de prueba y matriz de visibilidad

Documento de apoyo para comprobar qué ve cada rol. Antes de nada, aplicar en el
SQL editor de Supabase la migración `supabase/migrations/0004_fix_recursion_y_escalada_roles.sql`
(corrige la recursión de RLS y cierra la escalada de rol). Después crear los usuarios con
`docs/crear-usuarios-prueba.sql` (o desde Dashboard → Authentication → Users).

## Usuarios de demostración

| Email | Rol | Comercial asignado |
|---|---|---|
| admin@sfbathroom.demo | admin | — |
| direccion@sfbathroom.demo | direccion | — |
| financiero@sfbathroom.demo | financiero | — |
| administracion@sfbathroom.demo | administracion | — |
| almacen@sfbathroom.demo | almacen | — |
| comercial@sfbathroom.demo | comercial | Comercial DEMO-01 |
| comercial2@sfbathroom.demo | comercial | Comercial DEMO-02 |

Contraseña común de prueba: `SfbDemo1234!`. Borrar todos tras las comprobaciones.

## Qué ve cada rol (RLS actual)

| Área / datos | admin | direccion | financiero | administracion | almacen | comercial | lectura |
|---|---|---|---|---|---|---|---|
| Facturas y líneas | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ solo su cartera | ✅ |
| Clientes | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ solo su cartera | ✅ |
| Pedidos y cartera | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ solo su cartera | ✅ |
| Margen / compras / coste por lote | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Stock, cobertura, en tránsito | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cobros, aging, saldo | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Incidencias | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ solo su cartera | ❌ |
| Presupuesto | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ solo su cartera | ✅ |
| Alertas generadas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Marketing (MMM) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Financiero (cuentas/KPIs) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Alta/baja de usuarios y cambios de rol | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Notas:
- `comercial`/`comercial2` deben ver SOLO sus propias facturas/pedidos/clientes: es la
  comprobación clave del aislamiento por `comercial_id`.
- `lectura` no existe en la tabla anterior: añade `lectura@sfbathroom.demo` si quieres
  probarlo (ve comercial/stock/pedidos/alertas/presupuesto, no financiero ni marketing).
- `administracion` registra cobros y modifica pedidos, pero hoy **no ve facturas ni
  clientes** (no está en `facturas_select`/`clientes_select`). Para conciliar cobros con
  facturas probablemente querrá verlas → ajuste de RLS pendiente de decidir.
- `almacen` no ve cobros ni compras, y tampoco incidencias.

## Cómo comprobar

1. Accede a https://dgbxualxhrbbqglvxtxq.supabase.co con cada email/`SfbDemo1234!`.
2. La cabecera muestra el rol; la RLS filtra los datos por debajo.
3. Aún no hay datos: para ver cifras, cargar `facturas`/`pedidos` con datos reales o de
   prueba (pendiente del conector A3ERP).

## Verificación técnica de la recarga (opcional)

Tras aplicar la 0004, la siguiente consulta debe devolver filas (antes daba
`stack depth limit exceeded`):

```sql
select count(*) from public.facturas;
select count(*) from public.pedidos;
```