# Importación completa de Zoho CRM

Objetivo: traer todo el histórico de Zoho a la plataforma y dejar de usar Zoho,
sin perder información y sin duplicar.

## 0. Inventario real (sfbathroom, 23 nov 2026)

| Módulo | Registros |
|---|---|
| Usuarios | 3 reales (Adrian, Carlos, Pierpaolo) + 1 técnico |
| Cuentas | 2 (`KAME`, `KAMĖ`) |
| Contactos | ~200+ (pendiente conteo exacto) |
| Leads | sin contar |
| Oportunidades | 0 |
| Reuniones | 3 |
| Llamadas | 161 |
| Tareas | 1 |
| Notas | 14 |

**Una sola organización de Zoho** para SF, FUX y DOT. Zoho **no distingue empresa**:
cuentas, contactos, llamadas y notas están mezclados.

Consecuencia: el cruce se hace contra **las tres empresas a la vez** (`clientes` de SF + FUX + DOT).
Si un CIF existe en varias, se enlaza con la de actividad; si no hay CIF, se revisa a mano.

## 1. Destino de cada entidad

| Zoho | Destino | Clave de cruce |
|---|---|---|
| Users | `comerciales` + `profiles` | email / nombre |
| Accounts | `clientes` | **CIF** → nombre normalizado |
| Contacts | `clientes_contactos` | email → nombre + cuenta |
| Leads | tabla `leads_revision` (revisión manual) | email / CIF |
| Deals | nueva tabla `oportunidades` | cuenta + nombre |
| Events | `agenda` | contacto + cuenta + fecha |
| Calls | nueva tabla `interacciones` (tipo llamada) | contacto + fecha |
| Tasks | `agenda` (tipo tarea) | contacto + fecha |
| Notes | `interacciones` (tipo nota) | entidad relacionada |
| Attachments | bucket `zoho-adjuntos` | entidad + nombre |

## 2. Tablas nuevas necesarias

```sql
-- Equivalencias para poder repetir la importación sin duplicar
create table mapeo_externo (
  origen text not null,          -- 'zoho'
  entidad text not null,         -- 'account' | 'contact' | 'event' | 'call'…
  id_externo text not null,
  id_interno uuid not null,
  primary key (origen, entidad, id_externo)
);

-- Actividades no reunión: llamadas, notas, correos.
-- OJO: la tabla ya existía en producción desde la migración 0037 (rama
-- `feat/acceso-comercial`) con otro esquema. La 0095 la adapta en vez de crearla:
--   asunto        ← título
--   contenido     ← detalle (Zoho Description)
--   duracion_min  ← duración (Zoho ya la da en minutos)
-- y añade pendiente/origen/id_externo. Ver `supabase/migrations/0095_interacciones_zoho.sql`.

-- Oportunidades (Deals)
create table oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  cliente_id uuid references clientes(id),
  comercial_id uuid references comerciales(id),
  nombre text not null,
  importe numeric(14,2),
  etapa text,
  probabilidad integer,
  fecha_cierre date,
  estado text,
  origen text,
  id_externo text,
  unique (origen, id_externo)
);
```

## 3. Orden de importación

1. **Usuarios** → comerciales y perfiles (o mapeo al comercial existente).
2. **Cuentas** → clientes; las que no casen van a revisión.
3. **Contactos** → contactos del cliente (por cuenta).
4. **Leads** → revisión manual (no entran como clientes automáticamente).
5. **Notas** → interacciones.
6. **Llamadas** → interacciones.
7. **Tareas** → agenda.
8. **Reuniones** → agenda (con host, contacto y descripción).
9. **Oportunidades** → oportunidades (si hubiera).
10. **Adjuntos** → almacenamiento, enlazados a su entidad.

## 4. Reglas de cruce

- **Cuenta → cliente**: por `CIF` en **las tres empresas**; si no, por nombre normalizado
  (mayúsculas, sin acentos, sin S.L./S.A.). Nunca por aproximación difusa automática.
- **Interacciones sin cliente**: quedan en revisión hasta vincularlas.
- **Contacto → contacto**: por email; si no, nombre + cuenta.
- **Comercial**: por email; si no, por nombre exacto.
- Los que no casen se guardan en `*_revision` y se muestran en una pantalla de
  “Pendientes de vincular” para resolverlos a mano.

## 5. Garantías

- **Solo lectura** en Zoho: únicamente `GET`. Scopes `*.READ` cuando sea posible.
- **Idempotente**: cada registro lleva `origen='zoho'` + `id_externo`; reimportar
  actualiza, no duplica.
- **Simulación previa**: comando que informa cuántos casan, cuántos quedan sueltos
  y cuántos duplicados hay, sin escribir nada.
- **Trazabilidad**: cada importación deja un informe con totales y rechazos.

## 6. Fases

| Fase | Contenido | Esfuerzo |
|---|---|---|
| 1 | Tablas nuevas + mapeo + importador de **llamadas y notas** | M |
| 2 | **Reuniones** a agenda + historial | S |
| 3 | **Cuentas y contactos** (cruce con clientes) + revisión | M |
| 4 | **Leads** y **adjuntos** | M |
| 5 | Pantalla “Pendientes de vincular” y reimportación | S |
| 6 | Repetir con FUX y DOT | S cada una |

## 7. Lo que necesitamos del cliente

- Confirmado: **una sola organización** para las tres empresas.
- Confirmar qué empresa asignar cuando una cuenta no exista en A3ERP.
- Decidir qué hacer con **Leads** y con las cuentas que no casen con A3ERP.
- Autorización para revocar el token al terminar.
