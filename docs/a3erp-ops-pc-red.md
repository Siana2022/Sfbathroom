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

## 3. Tarea programada diaria (06:00)

Crear `C:\Apps\sfbathroom-ingesta\diario.bat` — lanza las tres empresas en secuencia
(`call` para que una fallida no corte a las siguientes):

```bat
@echo off
cd /d C:\Apps\sfbathroom-ingesta
mkdir logs 2>nul
echo [%date% %time%] INICIO >> logs\diario.log
call npm run diario:sf  >> logs\diario.log 2>&1
call npm run diario:fux >> logs\diario.log 2>&1
call npm run diario:dot >> logs\diario.log 2>&1
echo [%date% %time%] FIN >> logs\diario.log
```

Programar (Task Scheduler, sin abrir consola):

```
schtasks /Create /TN "A3ERP-Ventas-Diario" /SC DAILY /ST 06:00 /TR "C:\Apps\sfbathroom-ingesta\diario.bat"
```

Si el PC está despierto solo con "wake", marcar en Task Scheduler:
*Conditions → Wake the computer to run this task*.

Ver de que funcionó: `schtasks /Run /TN "A3ERP-Ventas-Diario"` y luego `logs\diario.log`.
Debe contener los tres resúmenes (`facturas_replace`) y terminar con `FIN`.
`diario:sf|fux|dot` re-leen la ventana móvil de 45 días, así que son idempotentes y no se
pisan.

## 4. Vigilancia (pendiente)

La ingesta graba su resultado/en el que el runner escribe; el **watchdog** que salta
si una empresa no carga en 24h está en el roadmap (necesita RESEND). De momento,
opcional: regla en el correo o CheckMK sobre `logs\diario.log` si no contiene
"ha finalizado". Las siguientes empresas se añaden como `diario:fux.bat`,
`diario:dot.bat` y sus `schtasks` (SF/FUX/DOT se lanzan en secuencia para no
pisarse).

## 5. Seguridad

- `.env` contiene credenciales de solo-lectura del ERP y el service-role de Supabase.
  El PC debe estar siempre encendido y con el usuario protegido con contraseña.
- La rotación del service-role requiere actualizar `.env` en este PC (o regenerarlo).