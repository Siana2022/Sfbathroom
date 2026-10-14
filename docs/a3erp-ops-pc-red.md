# A3ERP · Alta de la ingesta nocturna en un PC de la red

Puesta en marcha automática (Opción 1): un equipo de la red del cliente ejecuta cada
noche la ingesta de ventas hacia Supabase. Es la misma carpeta `ingesta/a3erp` del
repo, sin modificar.

## 1. Instalar Node.js (una vez)

Descargar **Node LTS** (`node-v22.x-win-x64.zip`, instalador MSI o ZIP portable)
desde <https://nodejs.org/en/download>. El ZIP portable no necesita permisos de
administrador:

1. Extraer a `C:\Apps\node`.
2. Añadir `C:\Apps\node` al `PATH` del usuario (Panel de control → Variables de
   entorno). Con MSI esto ya se hace solo.
3. Verificar en una terminal nueva: `node --version` → `v22.x.x`.

## 2. Copiar la ingesta y configurar

1. Copiar la carpeta `ingesta/a3erp` del repo a `C:\Apps\sfbathroom-ingesta`
   (mantener la estructura `.env` + `config/` + `src/`).
2. Abrir terminal en `C:\Apps\sfbathroom-ingesta` y ejecutar `npm install` (usa
   red; Windows suele dar falso antivirus por `mssql` — permitir; si bloquea, usar
   `npm install --ignore-scripts`).
3. Editar `.env` (los valores los tenemos en `ingesta/a3erp/.env` del repo):

   | Clave | Valor |
   | --- | --- |
   | `MSSQL_HOST` | `SERVER\A3ERP` |
   | `MSSQL_USER` | `siana` |
   | `MSSQL_PASSWORD` | `"M152G#1q"` — **¡entre comillas!** (ver punto 4) |
   | `MSSQL_PORT` | `1433` |
   | `MSSQL_ENCRYPT` | `false` — en claro, es lo que funciona |
   | `MSSQL_DATABASE` | `SFBATHROOM` (base de login; la consulta usa `{base}` por empresa) |
   | `SUPABASE_URL` | `https://dgbxualxhrbbqglvxtxq.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | (clave de servicio) |
   | `EMPRESA_CODIGO` | `SF` |
   | `PERIODO_START` | `2022-01-01` (reconciliación; el ERP SF solo tiene desde 2025) |
   | `VENTANA_DIAS` | `45` |
   | `LOTE_SIZE` | `500` (en desuso: el runner trocea por meses) |

> **Importante**: claves duplicadas en `.env` → Node usa **la última**.

4. **Verificación manual**: `npm run manual:agosto` (agosto 2026 SF, referencia:
   38 docus · 134 lín. · base 35.508,29 / total 41.212,50). Debe terminar con
   `"facturas_replace":38`.

4b. **Diagnóstico de discrepancias** (solo si una consulta vs el Power BI del cliente no
cuadra): copiar el archivo suelto `ingesta/a3erp/diag.mjs` del repo a
`C:\Apps\sfbathroom-ingesta` (junto al `.env`) y ejecutar en el PC (con VPN):

```
node --env-file=.env diag.mjs --referencia "SF 1062820.66,DOT 1385170.57,FUX 1363849.15"
```

pasándole las cifras del cliente del Power BI (YTD). Imprime por empresa, por
`SERIE`+`TIPODOC`, los agregados de `CABEFACV` (base, total, portes, desc_pie) y el
importe de las líneas de **suplemento** (`LINEFACT` con `ESCOMPONENTE='S'`, que la carga
normal excluye), más cuatro candidatos:
`C1 base (app)` = lo que suma la app hoy · `C2 base+portes` · `C3 base+suplementos netos` ·
`C4 total (con IVA)`, cada uno con la diferencia vs la cifra de referencia del cliente.
El candidato que salga a 0,00 indica qué mide el Power BI del cliente (revisar si hay que
ajustar `v_perf_facturacion_mensual`/neta o el loader).

## 2b. Solución de problemas

- **El runner falla con "Error de inicio de sesión del usuario 'siana'"** aunque
  PowerShell y `test.mjs` con la misma contraseña conectan bien: es el parseo de `.env`
  de Node (`--env-file`), que trata el `#` como **inicio de comentario** inline. La
  contraseña se truncaba en `M152G`. Solución: dejarla **entre comillas en el `.env`**
  (`MSSQL_PASSWORD="M152G#1q"`).
- **Supabase responde `canceling statement due to statement timeout`** en
  reconciliaciones grandes: el runner trocea el rango **por meses** y llama a
  `cargar_ventas` por tramo (idempotente); es el comportamiento normal.
- PowerShell bloquea `npm.ps1` (execution policy): usar `cmd` (`npm.cmd`) o `.bat`. La
  tarea programada usa `.bat` → no afectada.

## 3. Ingesta automática (diaria + reconciliación semanal)

La carpeta `ingesta/a3erp/bin/` trae los scripts ya hechos (vienen en el repo; se copian al
PC junto al resto, sin tocar `.env` ni `node_modules`):

- `ingesta-diaria.bat` — carga las 3 empresas en serie con la **ventana móvil de 45 días**
  (`npm run diario:sf`, `diario:fux`, `diario:dot`).
- `ingesta-semanal.bat` — **reconciliación completa** del histórico
  (`reconciliacion`, `reconciliacion:fux`, `reconciliacion:dot`).
- `programar-tareas.bat` — crea/actualiza las dos tareas en el Programador de tareas.

Cada `.bat` escribe un log por día en `ingesta\logs\` y, si alguna empresa falla, llama a
`src/notificar.mjs` (aviso por correo, ver punto 4). Los `.bat` van con fin de línea **CRLF**
(forzado por `.gitattributes`).

Registrar las tareas (ejecutar **como administrador**):

```
C:\Apps\sfbathroom-ingesta\bin\programar-tareas.bat
```

Crea:

| Tarea | Cuándo | Qué hace |
| --- | --- | --- |
| `sfbathroom-Ingesta-Diaria` | lunes a sábado, **22:00** | ventana móvil de 45 días |
| `sfbathroom-Ingesta-Semanal` | domingos, **22:00** | reconciliación completa |

Probar sin esperar la hora: `schtasks /Run /TN "sfbathroom-Ingesta-Diaria"`. El log del día
(`ingesta\logs\ingesta-diaria-AAAA-MM-DD.log`) debe terminar con
`OK: las 3 empresas cargadas sin errores.` / `FIN ingesta DIARIA.`

> **Ojo al pegar**: no pegar texto de instrucciones en la consola (las líneas sueltas se
> ejecutan como comandos; una de ellas borró las tareas). Pegar solo el comando.

## 4. Aviso por correo si falla (pendiente: verificar el dominio en Resend)

El `.bat` llama a `node --env-file=.env src/notificar.mjs` solo cuando una empresa falla; ese
script hace POST a `https://sfbathroom.vercel.app/api/jobs/aviso-ingesta` (protegido con
`JOBS_CRON_SECRET`), y el endpoint envía el correo vía Resend (`lib/datos/email.ts`).

Variables necesarias en el `.env` del PC: `APP_URL` y `JOBS_CRON_SECRET` (el mismo de Vercel).

**Estado: la app/endpoint funcionan, pero Resend rechaza** con
`403 The sfbathroom.com domain is not verified`. Destinatario `ALERTAS_EMAIL_TO =
asalinas@sfbathroom.com`, remitente `RESEND_FROM = alertas@sfbathroom.com` (todo ya en
Vercel). Para activarlo: **verificar `sfbathroom.com` en Resend** (https://resend.com/domains
→ Add Domain → los 3 registros DNS se añaden en **Hostinger**, en `send` y
`resend._domainkey`; no tocan la web ni el correo existente). Mientras no se verifique, el
fallo solo queda en el log y la tarea sigue funcionando igual.

## 5. Seguridad

- `.env` contiene credenciales de solo-lectura del ERP y el service-role de Supabase.
  El PC debe estar siempre encendido y con el usuario protegido con contraseña.
- La rotación del service-role requiere actualizar `.env` en este PC (o regenerarlo).