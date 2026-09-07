# Decisiones del responsable — cuestionario resuelto (29/09/2026)

Reglas cerradas con dirección para desbloquear el cuadro de mando. Cada decisión cita la
pregunta (Q#) y el estado de implementación.

## 1. Reglas de negocio

- **Q1. Portes**: la facturación neta NO incluye portes como venta. Si el porte supera un cierto
  importe se refleja, pero no se imputa al cliente. Se quiere el **coste de transporte anual**
  como métrica propia, extraída de la línea de proveedores (flete/aduana/seguro/transporte de
  `compras`). [HECHO: `lib/datos/transporte.ts` + tarjeta en Facturación]
- **Q2. Cliente activo** = ≥ 1 pedido en los últimos 12 meses. **+ aviso de clientes no activos**
  (listado y aviso en el semáforo de fuga).  [PENDIENTE: ajustar B5/alertas a definición 12M]
- **Q3. Cliente perdido** = lleva 12 meses sin facturar habiendo facturado en los 12 meses
  anteriores.  [PENDIENTE: ajustar B5]
- **Q4. Tipo de cambio**: el del pedido de compra (ya modelado en `compras.tipo_cambio`).
- **Q5. Márgenes/costes**: solo dirección y responsable financiero.  [PENDIENTE: cierre RLS +
  puerta en la app para /margen y señal "margen bajo" de /alertas]
- **Q6. Saturación comercial** = >1,5 M€ trimestrales gestionados y/o >60 clientes activos.
  **+ el responsable de dirección debe poder modificar estos umbrales desde un apartado de
  configuración** (mecanismo `alertas_config`, con interfaz de administración).  [HECHO:
  migración `0006` + `app/configuracion`]
- **Q7. Tarifa**: se usará tarifa de A3ERP al conectar; mientras tanto, precio medio del año
  anterior como referencia de erosión de precio.

## 2. Umbrales de alertas (valores iniciales, configurables luego desde la interfaz)

| Alerta | Umbral |
|---|---|
| Cliente en riesgo de fuga | 2,5× su frecuencia habitual de pedido |
| Caída de cliente relevante | −20% en 12M rodantes |
| Rotura de stock inminente | cobertura < 60 días |
| Pedido bajo margen objetivo | margen < 30% |
| Erosión de precio | desvío > 10% sobre tarifa |
| Cliente alargando pagos | DSO > 1,5× su media histórica |
| Vencido relevante | > 2.000 € a más de 60 días |
| Límite de crédito superado | riesgo vivo > 90% del límite |
| Concentración creciendo | +5 p.p. del % top 10 frente al trimestre anterior |
| Familia dependiente de un cliente | 1 cliente ≥ 70% de una familia relevante (≥8% del total) |
| Retraso de proveedor | plazo real > 75 días frente a los 60 pactados |
| Desviación de presupuesto | −15% mes o −10% acumulado |

## 3. Datos e integración

- **Q20. A3ERP**: pendiente. Versión de escritorio sobre servidor físico propio.
  → **Plantear sistema de exportación de datos** (ver `docs/exportacion-a3erp.md`).
- **Q21. Holding**: se trabaja solo SF Bathroom ahora, pero el esquema debe estar preparado para
  las 3 entidades (ya lo está; la vista consolidada queda para cuando haya datos de DOT/FUX).
- **Q22. Marketing y Financiero**: se deja para el final (el Excel está disponible, no se sube
  ahora).
- **Q23. Seguro de crédito**: pendiente de respuesta del departamento financiero.
- **Q24. Efectos/impagados**: proceso manual con Excel de consolidación bancaria. Se soportará
  como marcado manual en `cobros` y/o import del Excel; sin automatización.

## 4. Alcance de la app

- **Q25. Prioridad**: el orden lo decide Siana. Secuencia: Ciclo de crédito (B8+B2) →
  Rentabilidad (B3+B9) → Servicio y stock (B4) → Fuga y crecimiento (B5+B6) → Riesgo (B7) →
  Calidad (B10) → Transversal (filtros, export, drill-down al final).
- **Q26. Vistas temporales**: se construyen ya (diaria, semanal ISO, 12M rodantes, proyección de
  cierre).  [HECHO: `lib/datos/vistas.ts` + página de facturación]
- **Q27. Drill-down**: se espera al ERP.
- **Q28. Alertas por correo**: no por ahora, se empieza con buzón dentro de la app.

## 5. Esquema

- **Q29. Incidencias**: SÍ añadir `compra_id` (devoluciones por lote) y `fecha_cierre` (plazo de
  resolución). → migración `0005`. [PENDIENTE de aplicar por el cliente]