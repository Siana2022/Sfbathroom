# Integración de seguimiento comercial: A3ERP + Zoho CRM

Estado: **pendiente de explorar**. Anotado el 23 nov 2026.

## Objetivo

Traer a la plataforma todo el seguimiento de clientes que hoy vive en dos sitios:

1. **A3ERP**: seguimiento/visitas de comerciales.
2. **Zoho CRM**: oportunidades, contactos, llamadas, tareas y notas.

La idea es que el comercial vea en la ficha del cliente todo el histórico de relación,
sin cambiar de herramienta.

## Lo que ya sabemos de A3ERP

En el diagnóstico de tablas aparecen, entre otras:

- `REPVISITAS` (visitas de representantes)
- `__AGRUPACIONES`
- `INCI_INCIDENCIAS` (ya cargada en el módulo de Calidad)
- `COMISION`, `EXPEDCOM`

Falta ver la estructura de `REPVISITAS` y si existe alguna tabla de "seguimiento" con
notas o próximas acciones.

## Zoho CRM

- API REST v8 con OAuth2 (client id/secret + refresh token).
- Módulos relevantes: `Accounts` (empresas), `Contacts`, `Deals`, `Activities`
  (llamadas, tareas, eventos), `Notes`.
- Límites de API por plan; conviene sincronización incremental por `Modified_Time`.
- Decisión pendiente: **Zoho sigue siendo la fuente de verdad** (sincronización de
  solo lectura) o la plataforma lo sustituye (escritura bidireccional).

## Plan propuesto

1. **Diagnóstico A3ERP**: estructura y muestra de `REPVISITAS`.
2. **Credenciales Zoho**: client id/secret, refresh token y módulos a traer.
3. **Modelo de datos**:
   - `interacciones` (origen, tipo, fecha, asunto, notas, cliente_id, comercial_id, ref_externa)
   - `oportunidades` (si se traen Deals)
4. **Carga**:
   - A3ERP: script de ingesta (como el resto).
   - Zoho: job programado con sincronización incremental.
5. **UI**: pestaña "Seguimiento" en la ficha del cliente y timeline en la agenda.

## Preguntas abiertas

- ¿Zoho se mantiene o se migra?
- ¿Qué módulos entran en la primera fase?
- ¿Quién genera las credenciales de Zoho?
