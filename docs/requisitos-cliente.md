# Requisitos del cliente — cuestionario respondido

Transcripción de las respuestas de sfbathroom al cuestionario de descubrimiento
(`Cuestionario_sfbathroom.xlsx`). Fecha de respuesta: septiembre 2026.

## 1. Contexto general
- **Interlocutor técnico en A3ERP**: por definir ("eso tenemos que verlo").
- **Power BI**: fase transitoria mientras migramos, no se mantiene indefinidamente. Hoy lo
  mantiene el responsable de sfbathroom.
- **KPIs/procesos no listados**: ninguno adicional, la lista original ya cubre todo.
- **RGPD/confidencialidad**: el proyecto debe estar protegido por contraseña; de momento solo
  lo va a ver el responsable de sfbathroom, con un rol asignado.

## 2. Comercial / Facturación (A3ERP)
- A3ERP "tiene conexión directa con todo el servicio" — hay que investigar cómo expone los
  datos exactamente (confirmado por Claude vía búsqueda web: SQL Server + módulo BI con
  cubos predefinidos, ver `arquitectura.md`).
- Se pueden incorporar las credenciales del cliente para el acceso.
- **Frecuencia**: diaria. No hace falta tiempo real al principio.
- **Volumen**: 3.000–5.000 facturas/año.
- Cada comercial tiene una zona asignada.
- Análisis de venta: "todo" — canales actualmente todos offline.
- Se manejan devoluciones/abonos, deben restarse de las ventas.

## 3. Margen por producto
- El coste de artículo está registrado en A3ERP.
- Varía en función de la medida, pero son estándares ya creados (no fluctúa por lote/proveedor).
- Necesitan margen por línea, pedido, cliente y comercial (todos los niveles).
- Costes indirectos (transporte, comisión): "cuando lo conectemos lo veremos", pero en
  principio hay que tenerlos en cuenta todos.

## 4. Stock en tiempo real
- Se gestiona dentro de A3ERP.
- **3 almacenes**.
- A3ERP puede notificar cambios de stock (webhooks) — a validar en la práctica.
- "Tiempo real" en la práctica = diario (piezas de gran facturación, no rotación rápida).
- Prioridad: alertas de rotura de stock, más que solo visibilidad de cantidades.

## 5. Marketing Mix Modeling
- Solo canales offline: comerciales, call center, ferias.
- **Más de 10 años de histórico** de inversión por canal y fecha.
- Hoy lo gestiona el departamento financiero en hojas de Excel.
- Quieren que el modelo explique todas las variables de venta.
- Factores externos clave: estacionalidad y ferias.

## 6. Financiero
- Todo se trabaja con A3ERP, pero gran parte de la contabilidad sigue en Excel.
- **No hay API** de contabilidad disponible.
- Cierre mensual.
- No calculan ningún KPI financiero hoy — "es importante poder tenerlos todos".
- Cargar **3-5 ejercicios históricos**.

## 7. Usuarios y accesos
- De momento lo usa solo el responsable; cuando esté depurado se implantarán roles para
  financiero, comercial, fabricación, etc.
- Cada comercial ve solo sus propias ventas; el responsable de la empresa lo ve todo.
- Siana Digital solo construye el proyecto — la gestión de usuarios queda del lado del
  cliente (no hay panel de administración de usuarios construido todavía).
- Acceso desde PC primero; después, cuando esté depurado, un PWA para móvil.
