# Exportación de datos desde A3ERP (versión de escritorio)

Contexto (Q20 del cuestionario): el ERP es A3ERP **versión de escritorio** instalado en el
servidor físico de la empresa. El acceso directo a la BD del servidor está pendiente de
negociar. Mientras tanto se propone **exportación de datos programada** como vía de integración
de bajo coste, sin tocar el ERP.

## Objetivo

Que cada mañana los datos del ERP lleguen a Supabase sin intervención manual: exportación desde
el servidor → ubicación de intercambio → worker que la recoge y vuelca a Supabase.

## Opciones de exportación

### Opción A — Exportación nativa del ERP (informes/cubos) [RECOMENDADA]
A3ERP ya genera el cubo de Ventas que usa el Power BI actual. Plan:
1. Configurar en el ERP la **exportación programada** de los informes/cubos necesarios a un
   formato acotado (CSV por tabla: ventas, líneas, clientes, artículos, stock, cobros).
2. Guardar en una **carpeta compartida** del servidor (o FTP/SFTP) accesible en red.
3. Un workflow de **n8n** (cloud o VPS) consulta esa carpeta cada noche, transforma y hace
   upsert en Supabase (Tables REST con `service_role key`).

Ventajas: no requiere acceso de red directo a la BD ni credenciales de SQL Server; reutiliza lo
que ya genera el ERP. Inconvenientes: solo exporta lo que el ERP sepa generar (hay que validar
si existe cubo de stock/almacén además del de ventas).

### Opción B — Acceso directo a la BD del servidor (si el cliente lo facilita)
Si el servidor físico ejecuta SQL Server, se replica la conexión del Power BI actual:
lectura directa con `SELECT` de las tablas del cubo de ventas, ejecutada por n8n nocturno.
Inconveniente: requiere abrir la red (VPN/firewall) y las credenciales, que hoy están
pendientes. Si se consigue, es la vía más completa (stock, cobros, etc.).

### Opción C — Exportación manual como puente inicial
Si ningún exportador automático está disponible a corto plazo:
exportación manual (o semanal) de los CSV desde el ERP, subida a una carpeta compartida, y el
workflow de n8n la procesa igual que en la Opción A. Sirve para **arrancar la demo con datos
realistas** y validar el pipeline sin esperar a la automatización.

## Recomendación

Arrancar con la **Opción C → A**: definir con el cliente qué informes puede generar A3ERP hoy,
establecer la carpeta de intercambio, y montar el workflow n8n de carga. La Opción B se activa
si en algún momento llegan las credenciales. Fichero de mapa de campos a entregar: qué columna
del CSV va a qué tabla de Supabase (`facturas`, `factura_lineas`, `clientes`, `comerciales`,
`articulos`, `stock_actual`, `stock_movimientos`, `pedidos`, `pedido_lineas`, `compras`,
`compra_lineas`, `cobros`).

## Pendiente de la empresa

1. Confirmar qué exportaciones pueden programarse en el A3ERP de escritorio (¿existe cubo de
   stock además del de ventas?).
2. Crear la carpeta de intercambio accesible en red y decidir FTP vs SFTP.
3. Indicar si facilitarán también acceso SQL directo (Opción B) para no depender del exportador.