# A3ERP · Bloqueo del cliente (preguntas para desbloquear la ingesta)

Backlog de lo que necesita el proyecto de la parte de la empresa. Segmentado por
**quién** lo resuelve y **qué resuelve** una vez contestado.

## 1. Acceso a la base de datos (el bloqueante real)

Quién: responsable de TI / proveedor de A3ERP.
Qué desbloquea: poder leer los datos del ERP cada noche.

- ¿Dónde corre A3ERP? ¿Es la versión **servidor** con SQL Server, o la de **escritorio**
  (single-user, sin BD accesible en red)?
- Si es SQL Server:
  - nombre de instancia y base de datos,
  - ¿podemos crear un usuario **solo lectura** (`SELECT`)?,
  - ¿cómo se llega? ¿la máquina del runner está en su red, o hay que abrir VPN/túnel
    (ej. Tailscale)? ¿Puerto 1433 abierto a un rango de IPs?
- Si es escritorio: confirmar si el propio A3ERP puede **exportar informes/cubos
  programados** (CSV) a una carpeta compartida (alternativa sin acceso SQL).

## 2. Consulta del cubo de Ventas

Quién: quien mantiene el Power BI actual (u TI).
Qué desbloquea: el contrato de extracción (`a3erp.config.json`).

- El `SELECT`/consulta que usa el Power BI actual del «cubo de Ventas» (o la
  definición del cubo/source en A3ERP).
- ¿Ese Power BI lee de SQL Server directamente o de un archivo/exportación?
- ¿Existen cubos/productos equivalentes para **stock** y para **cobros/vencimientos**?

## 3. Coste de artículo (margen)

Quién: TI o comercial/finanzas.
Qué desbloquea: que el margen deje de ser 0.

- ¿De dónde sale el **coste de compra** del artículo? (¿cubo de compras? ¿maestro de
  artículos? ¿el Power BI actual muestra margen?)
- ¿El coste es por **lote/compras** (coste de llegada: flete, aduana, transporte) o un
  coste fijo por artículo?

## 4. Semántica de negocio (validar convenciones)

Quién: administración/finanzas.
Qué desbloquea: que las cifras coincidan con su Power BI.

- ¿Cómo distingue A3ERP **facturas vs abonos vs notas de cargo** (tipos/claves reales)?
- Los **abonos**: ¿se emiten como documento anulando a otro (¿campo «anula a»?) o
  independientes?
- ¿Hay **facturas retro-fechadas/rectificativas** con asientos posteriores a la fecha
  del documento? (condiciona la ventana móvil)
- Volumen: ¿confirmamos 3.000–5.000 documentos/año y 3 almacenes? ¿Cuántos **ejercicios
  hay que cargar** del histórico (¿3–5?) y cuál es el más antiguo con el que trabaja su
  Power BI?

## 5. Puesta en marcha (coordinación)

Quién: cliente + equipo.
- Fecha prevista para entregar 1–4 → para marcar la primera carga histórica.
- ¿Quién ejecuta la migración `0019_ingesta_a3erp_ventas.sql` en Supabase (SQL editor)?
- ¿Dónde corre el runner (máquina en su red / VPS)? ¿Quién le da de alta el cron?