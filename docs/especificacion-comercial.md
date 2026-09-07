SALINAS FURIO INVEST
Cuadro de mando comercial
SF Bathroom  ·  Especificación funcional para desarrollo
| Destinatario | Técnico responsable de la implantación |
|---|---|
| Alcance | SF Bathroom, con el modelo de datos preparado para replicar en DOT Surfaces sin rehacerlo |
| Emisor | Dirección General — Manuel Salinas |
| Versión | 1.0 |

Contexto operativo relevante para el diseño
~40 clientes activos · 7 familias de producto · marca Starbath Plus y marca blanca
Stock propio en almacén de 4.500 m²
Proveedor único en China, con 60 días de plazo de entrega
Cobro pactado a 30 días · margen bruto de referencia 36%
Estacionalidad marcada: pico mayo-julio, valle agosto-diciembre
Equipo comercial, administración, financiero y dirección compartidos físicamente con DOT Surfaces

# Índice

| 0 | Requisitos transversales — dimensiones, reglas de negocio y requisitos técnicos |
|---|---|
| Bloque 1 | Facturación |
| Bloque 2 | Entrada de pedidos y cartera pendiente |
| Bloque 3 | Margen y rentabilidad |
| Bloque 4 | Stock y nivel de servicio |
| Bloque 5 | Comportamiento de cliente |
| Bloque 6 | Canal y marca |
| Bloque 7 | Concentración y riesgo de cartera |
| Bloque 8 | Crédito y cobro |
| Bloque 9 | Actividad y capacidad del equipo comercial |
| Bloque 10 | Calidad, devoluciones e incidencias |
| Bloque 11 | Alertas automáticas |
| 12 | Cuadros de mando por perfil y cadencia |
| 13 | Fases de implantación |
| 14 | Cuestiones a resolver con el técnico antes de empezar |

Los bloques 2, 4, 5, 6, 7, 8, 9 y 10 son incorporaciones al planteamiento inicial. Los bloques 1 y 3 recogen lo ya previsto con los ajustes indicados.

# 0. Requisitos transversales

Aplican a todo el cuadro de mando. Conviene cerrarlos antes de empezar a construir bloques.

## 0.1 Dimensiones

Deben existir todas y ser filtrables de forma cruzada en cualquier bloque.
| Dimensión | Niveles y atributos requeridos |
|---|---|
| Tiempo | Día → semana ISO → mes → trimestre → año. Además: 12 meses rodantes, acumulado del año (YTD), mismo periodo del año anterior (PYTD) |
| Cliente | Código · nombre · grupo empresarial (si un cliente tiene varias razones sociales, deben poder consolidarse) · país · canal · tipología (tienda / construcción / fabricante de mueble) · comercial asignado · fecha de primer pedido · estado (activo / inactivo / perdido) |
| Geografía | País de facturación y país de entrega, como dos campos independientes. Región o provincia en España e Italia |
| Comercial | Persona asignada. Debe permitir ver la carga total de la persona sumando SF Bathroom + DOT Surfaces |
| Producto | Referencia (SKU) · descripción · familia (las 7) · marca (Starbath Plus / marca blanca / marca blanca por cliente) · formato o tipología · proveedor · estado (activo / descatalogado / novedad) |
| Marca y canal | Starbath Plus frente a marca blanca. Dentro de Starbath Plus: tienda frente a construcción |
| Documento | Tipo (factura / abono / nota de cargo) · pedido de origen · albarán |


## 0.2 Reglas de negocio a fijar con dirección antes de programar

Estas definiciones condicionan todos los cálculos. No deben quedar al criterio del técnico.
Facturación neta: Facturación ya descontado abonos, descuentos de pie de factura, rappels y portes repercutidos. Regla propuesta: facturación neta = bruto − abonos − descuentos − rappels devengados. Los portes se muestran aparte, no como venta.
Cliente activo: cliente con al menos un pedido en los últimos 12 meses.
Cliente perdido: propuesta — cliente que facturó en los 12 meses anteriores y lleva más de 90 días sin pedir.
Fecha de referencia: la facturación se ancla a fecha de factura; los pedidos, a fecha de entrada del pedido; el servicio, a fecha de albarán. Las tres deben poder cruzarse.
Moneda: todo en euros. Si hay compras en dólares, fijar si el tipo de cambio aplicado al coste es el del pedido, el del pago o el medio del periodo.

## 0.3 Requisitos técnicos

| Requisito | Especificación |
|---|---|
| Origen de datos | ERP como fuente única de verdad. Identificar si el coste de compra está disponible a nivel de línea de factura o solo a nivel de artículo, ya que condiciona el bloque 3 |
| Actualización | Diaria automática nocturna como mínimo. Facturación y cobros al día anterior |
| Trazabilidad | Todo indicador debe permitir drill-down hasta el documento origen (factura, línea, pedido). Un número que no se puede abrir no se usa |
| Exportación | Cualquier vista exportable a Excel |
| Perfiles de acceso | Dirección (todo) · comercial (su cartera) · administración (cobros y cartera) · fábrica y almacén (stock y servicio). Los márgenes solo visibles para dirección y financiero |
| Multiempresa | El modelo debe soportar SF Bathroom, DOT Surfaces y Fuxsabany como entidades sobre el mismo esquema, con vistas separadas y una vista consolidada de holding |


# Bloque 1. Facturación

Núcleo del cuadro de mando. Es lo que ya estaba previsto, con los ajustes incorporados.

## 1.1 Métricas

| Métrica | Definición o fórmula |
|---|---|
| Facturación neta | Bruto − abonos − descuentos − rappels |
| Unidades facturadas | Número de piezas |
| Precio medio de venta | Facturación neta ÷ unidades |
| Número de facturas | Recuento de documentos |
| Ticket medio por factura | Facturación neta ÷ número de facturas |


## 1.2 Vistas temporales obligatorias

| Vista | Uso previsto |
|---|---|
| Diaria | Solo para control de cierre de mes y detección de errores de facturación. No usar para análisis de tendencia |
| Semanal | Semana ISO, con acumulado y comparativa frente a la misma semana del año anterior |
| Mensual | Mes cerrado frente al mismo mes del año anterior y frente a presupuesto |
| Anual | Año natural, YTD frente a PYTD |
| 12 meses rodantes | Curva móvil. Vista principal de tendencia: neutraliza la estacionalidad y evita las lecturas falsas de comparar agosto con julio |
| Proyección de cierre | Acumulado más proyección de cierre de año basada en el peso histórico de cada mes |


## 1.3 Desgloses

Todos combinables entre sí y con cualquier dimensión del apartado 0.1.
Por cliente y por grupo empresarial
Por comercial
Por país de facturación
Por región o provincia en España e Italia
Por artículo (SKU)
Por familia de producto (7 familias)
Por marca (Starbath Plus / marca blanca)
Por canal (tienda / construcción / fabricante de mueble)

## 1.4 Análisis de variación

Para cualquier comparación entre dos periodos, descomponer la diferencia en sus causas.
| Efecto | Qué explica |
|---|---|
| Efecto volumen | Cuánto de la variación viene de vender más o menos piezas |
| Efecto precio | Cuánto viene de haber subido o bajado precios |
| Efecto mix | Cuánto viene de haber cambiado la composición de lo vendido, con más referencias caras o más baratas |
| Efecto cliente | Cuánto aportan clientes nuevos, cuánto se pierde por clientes perdidos y cuánto por crecimiento o caída de los existentes |

| Por qué es crítico Con un precio medio de 35 €, buena parte del movimiento de facturación es mix y no volumen real. Sin esta descomposición, el cuadro de mando informa pero no explica. |
|---|


## 1.5 Presupuesto

Carga del presupuesto anual desglosado por mes, cliente, comercial y familia, no solo un total anual
Desviación en importe y en porcentaje, en cada nivel
Grado de cumplimiento YTD y proyección de cierre

# Bloque 2. Entrada de pedidos y cartera pendiente


## 2.1 Métricas

| Métrica | Definición |
|---|---|
| Pedidos captados | Importe y unidades de pedidos entrados en el periodo |
| Número de pedidos captados | Recuento |
| Ticket medio de pedido | Importe ÷ número de pedidos |
| Cartera pendiente de servir | Importe y unidades de pedidos aceptados y no entregados, a fecha de hoy |
| Antigüedad de la cartera | Desglose de la cartera pendiente por tiempo transcurrido desde la entrada del pedido |
| Cartera por fecha solicitada | Calendario de compromisos de entrega a 30, 60 y 90 días |
| Ratio pedidos / facturación | Pedidos captados ÷ facturación del mismo periodo. Por encima de 1 la cartera crece; por debajo, se está consumiendo |
| Pedidos anulados | Importe, unidades, porcentaje y motivo |
| Pedidos modificados | Número y tipo de cambio: cantidad, fecha o referencia |
| Plazo medio pedido → entrega | Días, por cliente y por familia |
| Cumplimiento de fecha comprometida | Porcentaje de pedidos entregados en la fecha prometida |


## 2.2 Desgloses

Los mismos que el bloque 1: cliente, comercial, país, artículo, familia, marca y canal.

# Bloque 3. Margen y rentabilidad


## 3.1 Coste completo de llegada

Requisito previo: el coste de cada referencia debe incluir todos los componentes, no solo el precio de compra.
| Componente | Notas |
|---|---|
| Precio de compra al proveedor | En moneda original y en euros |
| Flete marítimo | Reparto por contenedor entre las referencias que viajan en él |
| Aduana y aranceles | — |
| Seguro | — |
| Transporte interior hasta almacén | — |
| Diferencia de tipo de cambio | Si la compra es en dólares |
| Roturas y mermas en tránsito | Porcentaje histórico aplicado por familia |

| Coste por lote, no coste medio Debe existir coste real por lote de entrada. Con plazos de 60 días y variaciones de flete y de tipo de cambio, un coste medio antiguo infravalora o sobrevalora el margen de forma sistemática. |
|---|


## 3.2 Niveles de margen

| Nivel | Cálculo |
|---|---|
| Margen bruto en euros | Facturación neta − coste completo de llegada |
| Margen bruto en porcentaje | Margen en euros ÷ facturación neta |
| Margen por unidad | Margen en euros ÷ unidades |


## 3.3 Desgloses del margen

Todos obligatorios.
Por artículo (SKU)
Por familia
Por cliente y grupo — el mismo producto no deja el mismo margen a un fabricante de mueble que a una tienda
Por pedido y por factura — para detectar pedidos servidos por debajo del margen objetivo
Por comercial — para evitar que el crecimiento se compre con descuento
Por marca (Starbath Plus frente a marca blanca) y por canal
Por país

## 3.4 Análisis específicos

| Análisis | Contenido |
|---|---|
| Matriz margen × rotación por referencia | Cuatro cuadrantes: alto margen y alta rotación (proteger) · alto margen y baja rotación (empujar comercialmente) · bajo margen y alta rotación (renegociar precio o coste) · bajo margen y baja rotación (candidatos a descatalogar) |
| Ranking de clientes por margen absoluto | No solo por facturación. Un cliente puede estar en el top de ventas y no en el top de aportación |
| Desviación tarifa frente a precio real | Por cliente y referencia. Mide la erosión de precio que se produce en el día a día |
| Evolución del margen en 12 meses rodantes | Con alerta si cae por debajo del objetivo del 36% |


# Bloque 4. Stock y nivel de servicio

| Bloque nuevo y prioritario Con stock propio y 60 días de reposición, es donde se decide tanto el servicio al cliente como el capital inmovilizado. Sin este bloque no se puede planificar la compra del pico de mayo a julio. |
|---|


## 4.1 Métricas

| Métrica | Definición |
|---|---|
| Stock en unidades y en euros | Por referencia, familia y marca |
| Cobertura en días | Stock actual ÷ consumo medio diario de los últimos 90 días |
| Cobertura ajustada por estacionalidad | Stock actual ÷ consumo diario previsto de los próximos 60 días según patrón histórico |
| Rotación | Consumo de 12 meses ÷ stock medio |
| Stock en tránsito | Unidades y euros embarcados no recibidos, con fecha estimada de llegada |
| Stock disponible real | Stock físico − reservado por pedidos pendientes |
| Fill rate | Porcentaje de líneas de pedido servidas completas a la primera |
| Roturas de stock | Número de veces y unidades no servidas por falta de existencias |
| Venta perdida estimada | Unidades no servidas × precio medio de la referencia |
| Pedidos pendientes por falta de stock | Importe y antigüedad |
| Stock muerto | Referencias sin salida en los últimos 6 y 12 meses: unidades y euros |
| Stock de baja rotación | Referencias con cobertura superior a 180 días |
| Valor total inmovilizado | Euros en stock y su evolución mensual |
| Referencias bajo punto de pedido | Listado con días restantes de cobertura |


## 4.2 Requisitos funcionales

Alerta automática cuando la cobertura de una referencia baje del plazo de reposición de 60 días más un margen de seguridad
Cruce entre cobertura y cartera de pedidos pendientes: una referencia con 40 días de cobertura y un pedido grande entrando está en rotura, aunque el indicador aislado no lo muestre
Propuesta de pedido de aprovisionamiento calculada como consumo previsto en el plazo de reposición, más stock de seguridad, menos stock disponible, menos stock en tránsito

# Bloque 5. Comportamiento de cliente


## 5.1 Métricas de base

| Métrica | Definición |
|---|---|
| Clientes activos | Con pedido en los últimos 12 meses |
| Clientes nuevos | Primer pedido en el periodo. Número y facturación aportada |
| Clientes recuperados | Vuelven a pedir tras un periodo de inactividad |
| Clientes perdidos | Según la regla del apartado 0.2. Número y facturación que representaban |
| Clientes en riesgo de fuga | Sin pedido en un plazo superior a su frecuencia media habitual |
| Tasa de retención | Clientes activos que repiten respecto al periodo anterior |
| Facturación media por cliente | — |
| Días desde el último pedido | Por cliente, con semáforo según su frecuencia histórica |
| Frecuencia media de pedido | Días entre pedidos, por cliente |
| Familias compradas por cliente | De las 7. Mide la penetración y la solidez de la relación |
| Referencias distintas por cliente | — |
| Antigüedad del cliente | Meses desde el primer pedido |
| Facturación acumulada histórica | Por cliente |


## 5.2 Análisis obligatorios

| Análisis | Contenido y uso |
|---|---|
| Matriz cliente × familia | Qué familias compra cada cliente y cuáles no. Es el mapa de venta cruzada y, a la vez, el mapa de vulnerabilidad |
| Semáforo de fuga | Cada cliente en verde, ámbar o rojo según la desviación entre sus días sin pedir y su frecuencia histórica. Los clientes del top 10 en ámbar o rojo deben aparecer destacados en la portada del cuadro de mando |
| Evolución individual | Para cada cliente, su facturación en 12 meses rodantes frente a los 12 anteriores, con variación en euros y en porcentaje. Ordenado por variación, no por volumen: el valor está en el delta |
| Análisis de cohortes | Comportamiento de los clientes captados en cada año, para medir si los nuevos clientes maduran o se pierden |


# Bloque 6. Canal y marca


## 6.1 Métricas por segmento

Para cada uno de los segmentos: Starbath Plus y marca blanca.
Facturación en euros y porcentaje sobre el total
Unidades y precio medio
Margen en porcentaje y margen absoluto
Número de clientes y facturación media por cliente
Número de referencias activas
Crecimiento frente al año anterior
Evolución del peso relativo en 12 meses rodantes
Entrada de pedidos

## 6.2 Indicadores de dirección estratégica

| Indicador | Para qué sirve |
|---|---|
| % de facturación Starbath Plus sobre el total | Con objetivo y trayectoria. Es el indicador que resume si la estrategia avanza |
| Diferencial de margen Starbath Plus frente a marca blanca | Cuantifica en euros lo que aporta cada punto de traslado de facturación de un canal al otro, y con ello justifica la inversión comercial en la marca |
| Facturación de marca blanca por cliente-fabricante | Mide la dependencia dentro del canal más sustituible |


# Bloque 7. Concentración y riesgo de cartera


## 7.1 Concentración de clientes

| Métrica | Notas |
|---|---|
| % top 1 | — |
| % top 3 | — |
| % top 10 | — |
| % top 20 | — |
| Índice de concentración (Herfindahl) | Un único número, comparable mes a mes |
| Curva de Pareto de clientes | Cuántos clientes acumulan el 50% y el 80% de la facturación |
| Evolución de la concentración | En 12 meses rodantes. Indica si el crecimiento diversifica o refuerza la dependencia |


## 7.2 Concentración de producto y marca

Porcentaje de facturación de las 3 familias principales sobre el total
Porcentaje de facturación de las 20 referencias principales
Porcentaje de marca blanca frente a Starbath Plus (ver bloque 6)
Número de referencias que concentran el 80% de la facturación

## 7.3 Concentración geográfica

Porcentaje por país: España, Italia, Francia, Alemania y Portugal
Evolución del peso de cada mercado

## 7.4 Cruce crítico: matriz cliente × familia de riesgo

Identificar automáticamente las combinaciones donde una familia relevante depende de un solo cliente. Ejemplo del riesgo a detectar: una familia que representa el 25% de la facturación y de la que un único cliente absorbe el 90%. Al perder ese cliente se pierden a la vez el cliente y la viabilidad de la familia, con el stock correspondiente inmovilizado.
| Requisito Este riesgo no es visible analizando clientes y productos por separado. Requiere la matriz cruzada con umbral de alerta configurable. |
|---|


## 7.5 Riesgo de proveedor

Porcentaje de compras concentradas en el proveedor chino, hoy canal único
Número de referencias sin proveedor alternativo identificado
Facturación en euros expuesta a ese canal único
Plazo real de entrega frente a los 90 días pactados, y su desviación histórica
Bloque 8. Crédito y cobro

## 8.1 Métricas

| Métrica | Definición |
|---|---|
| Saldo total de clientes | Euros pendientes de cobro |
| DSO real | (Saldo de clientes ÷ facturación del periodo) × días del periodo |
| Desvío DSO real frente a 30 días pactados | En días y en euros de financiación no decidida |
| DSO por cliente | Días medios reales de cobro de cada cliente |
| Aging de la deuda | Al día · 1-30 días vencido · 31-60 · 61-90 · más de 90 |
| Importe vencido total | Y porcentaje sobre el saldo |
| Vencido por cliente | Con desglose por tramo de antigüedad |
| Evolución del DSO por cliente | Detecta al cliente que pasa de pagar a 30 días a pagar a 60 |
| Impagos y devoluciones de efectos | Número e importe |
| Riesgo vivo por cliente | Saldo pendiente más cartera de pedidos no servidos |
| Límite de crédito frente a riesgo vivo | Porcentaje de consumo del límite, con alerta al superarlo |
| Cobertura de seguro de crédito | Si existe: importe cubierto y no cubierto por cliente |


## 8.2 Uso previsto

Señal temprana de deterioro: un cliente del top 3 alargando sus pagos es la primera señal de que la relación o su situación financiera van mal. Aparece antes que la caída de pedidos
Enlace con tesorería: el desvío de DSO cuantifica el circulante atrapado. Es exactamente el dinero necesario para financiar la compra a China del pico de mayo, con 60 días de plazo por delante

# Bloque 9. Actividad y capacidad del equipo comercial


## 9.1 Métricas por persona

| Métrica | Notas |
|---|---|
| Facturación gestionada en SF Bathroom | — |
| Facturación gestionada en DOT Surfaces | — |
| Facturación total gestionada (SF + DOT) | Indicador real de carga. Es el que importa |
| Clientes activos gestionados (SF + DOT) | — |
| Margen absoluto aportado | — |
| Cumplimiento de presupuesto | — |
| Clientes nuevos captados | — |
| Clientes perdidos en su cartera | — |
| Pedidos gestionados | Proxy de carga transaccional |
| Descuento medio aplicado | Detecta si el crecimiento se compra con precio |
| Familias vendidas por cliente de su cartera | Mide la venta cruzada efectiva |


## 9.2 Indicador de saturación

Definir, junto con dirección, un umbral de facturación y de número de clientes gestionables por persona. Cuando alguien se acerque al umbral, el cuadro de mando debe avisar. Es el indicador que anticipa el cuello de botella comercial del holding, y hoy no existe en ningún sitio.

# Bloque 10. Calidad, devoluciones e incidencias

| Métrica | Definición |
|---|---|
| % de devoluciones | Sobre facturación, en euros y en unidades |
| Devoluciones por motivo | Rotura de transporte · defecto de fabricación · error de pedido · error de expedición · rechazo comercial |
| Devoluciones por cliente | Importe y porcentaje sobre su facturación |
| Devoluciones por referencia y familia | Detecta problemas de producto |
| Devoluciones por lote de proveedor | Detecta problemas de producción en origen. Imprescindible con proveedor único |
| Coste de incidencias | Importe de abonos, reposiciones y portes de retorno |
| Reclamaciones abiertas | Número y plazo medio de resolución |
| Coste de incidencias por cliente | Cruzado con su margen, para conocer la rentabilidad neta real |


# Bloque 11. Alertas automáticas

El cuadro de mando debe avisar, no solo mostrar. Alertas configurables por umbral, con envío por correo y aviso en la portada.
| Alerta | Disparador propuesto |
|---|---|
| Cliente en riesgo de fuga | Días sin pedido superiores a su frecuencia habitual, con prioridad para el top 10 |
| Caída de cliente relevante | Descenso superior al X% en 12 meses rodantes frente a los 12 anteriores |
| Rotura de stock inminente | Cobertura inferior al plazo de reposición más el margen de seguridad |
| Pedido por debajo del margen objetivo | Margen del pedido inferior al umbral fijado |
| Erosión de precio | Precio facturado con desviación superior al X% sobre tarifa |
| Cliente alargando pagos | DSO del cliente por encima de su media histórica |
| Vencido relevante | Importe vencido a más de 60 días por encima del umbral |
| Límite de crédito superado | Riesgo vivo por encima del límite asignado |
| Concentración creciendo | Aumento del % top 3 o top 10 respecto al trimestre anterior |
| Comercial cerca de saturación | Carga SF + DOT por encima del umbral |
| Familia dependiente de un solo cliente | Un cliente concentra más del X% de una familia relevante |
| Retraso de proveedor | Plazo real por encima de los 60 días previstos |
| Desviación de presupuesto | Incumplimiento superior al X% en el mes o en el acumulado |

| Umbrales pendientes de decisión Todos los valores marcados como X% son decisión de dirección y deben quedar configurables desde la interfaz, no fijados en código. |
|---|


# 12. Cuadros de mando por perfil y cadencia

No todos los indicadores se miran con la misma frecuencia. Se proponen cuatro vistas distintas sobre el mismo modelo de datos.
| Vista | Frecuencia | Destinatario | Contenido |
|---|---|---|---|
| Operativa | Semanal | Dirección, comercial y administración | Entrada de pedidos · cartera pendiente · cobertura de stock y roturas · cobros y vencidos · facturación de la semana |
| Comercial | Mensual | Dirección y comercial | Facturación con todos los desgloses · análisis de variación · margen por cliente y producto · comportamiento y fuga de clientes · canal y marca · cumplimiento de presupuesto |
| Estratégica | Trimestral | Dirección y consejo | Concentración de cartera · evolución de Starbath Plus · riesgo de proveedor · rentabilidad por canal · saturación del equipo · 12 meses rodantes |
| Consolidada de holding | Mensual | Dirección | SF Bathroom más DOT Surfaces: facturación, margen, carga del equipo compartido y tesorería conjunta |
