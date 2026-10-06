# A3ERP · Contrato de ingesta por CSV/Excel (Opción 1 — sin IT)

Objetivo: recibir las ventas de A3ERP **exportadas por el propio programa** a una
carpeta sincronizada (o por e-mail) y volcarlas en Supabase, **sin tocar el servidor**,
crear usuarios SQL ni depender del equipo de IT del cliente. La ingesta es idéntica a la
lectura SQL salvo en el origen: en lugar de consultar el cubo, se lee un fichero.

## Prerrequisitos que el cliente debe confirmar (bloque de validación)
1. ¿A3ERP **Servidor/GRP** o **escritorio**? ("Ayuda → Acerca de").
2. ¿Existe **gestor/explorador de informes** con informe de Ventas de **detalle**?
3. ¿Existe **"Programar informes"** con salida a **carpeta** o **e-mail**?
4. La exportación a mano debe traer **detalle por línea** (documento + líneas), no resumen.

## Formato de fichero aceptado
- **CSV** (UTF-8, separador `;` o `,`) o **XLSX** (1 hoja, primera fila = cabecera).
- Un fichero por fecha de exportación: `ventas_AAAA-MM-DD.csv` en la carpeta acordada.
- Codificación: si sale con acentos corruptos, el pipeline intenta `cp1252/latin1 → UTF-8`.

## Columnas mínimas requeridas (contrato de mapeo)
Cada fila = una **línea de documento**. Las columnas de documento se repiten en cada línea.

| Campo destino (Supabase) | Columna en el fichero (nombres orientativos) | Obligatorio |
| --- | --- | --- |
| `facturas.numero_erp` | `Nº doc` / `NUM_DOC` | Sí |
| `facturas.fecha` | `FECHA` | Sí |
| `facturas.tipo_documento` | `TIPO` | Sí |
| `facturas.cliente_id` (por código) | `COD_CLI` | Sí |
| `clientes.nombre` | `NOMBRE_CLI` | Sí* |
| `facturas.comercial_id` (por código) | `COD_COM` | No |
| `facturas.empresa_id` (código) | `COD_EMP` | No* |
| `facturas.total` | `TOTAL` / `TOTAL_DOC` | Sí |
| `factura_lineas.linea` | `LINEA` | No (se autogenera) |
| `factura_lineas.articulo_id` (código) | `COD_ART` | Sí |
| `articulos.nombre` | `NOMBRE_ART` | No* |
| `factura_lineas.cantidad` | `CANTIDAD` | No |
| `factura_lineas.precio_unitario` | `PRECIO` | No* |

\* opcional si ya tenemos el maestro cargado.

## Reglas de ingesta (idénticas a la lectura directa)
- **Abonos en negativo**: si el fichero los trae en positivo, el uma humano de normalización
  los negativiza según `tiposDocumento` del config.
- **Swap atómico por rango**: lo que llega en el fichero **sustituye** el rango de fechas
  correspondiente en staging (misma transacción que `a3erp.aplicar_ventas`). Nunca acumula.
- **Reconciliación por sustitución parcial**: para la semanal completa se descarga el
  histórico completo en un fichero único (o varios por mes) y se sustituye todo — no fila a fila.
- **Maestros primero**: si el fichero incluye ficheros de clientes/artículos/comerciales,
  se procesan antes que ventas (mismo contrato `a3erp.aplicar_maestros`).
- Errores de formato → fichero marcado como **no procesado** en `a3erp.estado`, alerta Resend,
  no bloquea la corrida del día.

## Pipeline (lado nuestro, sin entrar en su red)
1. La carpeta de exportación del A3ERP se **sincroniza** (Google Drive / Dropbox / MEGA /
   carpeta compartida) con una carpeta de entrada que nuestro runner vigila.
2. Runner (Node, ya en `ingesta/a3erp/`): detecta el fichero nuevo → parsea → normaliza →
   escribe en `a3erp.staging_facturas`/`lineas` → `a3erp.aplicar_ventas` → marca el fichero
   como procesado.
3. Si el idioma final es e-mail: el pipeline lee la bandeja de entrada en vez de la carpeta
   (misma lógica de mapeo).

## Decisión pendiente del cliente (lista para pedir)
Con los 4 puntos del bloque de validación se decide: **carpeta** (ideal), **e-mail**, o
si no puede exportar detalle → revisar Opción 2 (script ODBC en un PC) o la API de pago.

## Estado
Identificación de esquema de Supabase: listo. Pipeline CSV: en cuanto se confirme el
formato real del fichero se rellenan nombres de columnas y `tiposDocumento` en el config.