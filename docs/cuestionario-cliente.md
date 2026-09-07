# Cuestionario para el responsable de sfbathroom

Rellena junto a cada pregunta la opción elegida (o escribe tu respuesta). Las opciones marcadas
como **[RECOMENDADO]** son las que proponemos por defecto para que las confirmes o cambies.

---

## 1. Reglas de negocio (bloquean los cálculos)

**Q1. Portes de la facturación neta.**
- a) Los portes van aparte, no como venta [RECOMENDADO]
- b) Los portes se incluyen en la facturación neta

**Q2. Definición de "cliente activo".**
- a) Al menos un pedido en los últimos 12 meses [RECOMENDADO]
- b) Al menos una factura en los últimos 12 meses
- c) Otra (específica)

**Q3. Definición de "cliente perdido".**
- a) Facturó en los 12 meses anteriores y lleva más de 90 días sin pedir [RECOMENDADO]
- b) Estado marcado a mano en el CRM
- c) Otra (específica)

**Q4. Tipo de cambio aplicado al coste de compras en dólares.**
- a) El del pedido de compra [RECOMENDADO]
- b) El del pago
- c) El medio del periodo

**Q5. ¿Quién debe ver márgenes y costes?**
- a) Solo dirección y financiero [RECOMENDADO]
- b) También los comerciales (solo los suyos)

**Q6. Umbral de saturación de un comercial** (¿cuándo se considera "saturado"?).
- a) > 1,5 M€ trimestrales gestionados y/o > 60 clientes activos [RECOMENDADO]
- b) Otros (específica importe y nº de clientes)

**Q7. Tarifa para medir erosión de precio.**
- a) Usar lista de tarifa de A3ERP cuando se conecte; mientras tanto, precio medio del año anterior [RECOMENDADO]
- b) No medir erosión por ahora

---

## 2. Umbrales de alertas (valores iniciales, luego configurables en la app)

Proponemos estos valores de arranque. Confirmar o corregir cada uno:

| Q# | Alerta | Umbral propuesto |
|----|--------|------------------|
| Q8 | Cliente en riesgo de fuga | 2,5× su frecuencia habitual de pedido |
| Q9 | Caída de cliente relevante | −20% en 12M rodantes |
| Q10 | Rotura de stock inminente | cobertura < 60 días (plazo reposición) |
| Q11 | Pedido bajo margen objetivo | margen < 30% |
| Q12 | Erosión de precio | desvío > 10% sobre tarifa |
| Q13 | Cliente alargando pagos | DSO > 1,5× su media histórica |
| Q14 | Vencido relevante | > 2.000 € a más de 60 días |
| Q15 | Límite de crédito superado | riesgo vivo > 90% del límite |
| Q16 | Concentración creciendo | +5 p.p. del % top 10 frente al trimestre anterior |
| Q17 | Familia dependiente de un cliente | 1 cliente ≥ 70% de una familia relevante (≥8% del total) |
| Q18 | Retraso de proveedor | plazo real > 75 días frente a los 60 pactados |
| Q19 | Desviación de presupuesto | −15% mes o −10% acumulado |

> ¿Alguno se cambia? Indica solo los que quieras ajustar.

---

## 3. Datos e integración (lo que necesitamos del cliente)

**Q20. Conector A3ERP.** ¿Nos puedes facilitar ya servidor, nombre de BD y credenciales de
lectura del SQL Server, y confirmar acceso de red (VPN/firewall)? *(Fecha prevista: ____)*

**Q21. Holding.** ¿Trabajamos solo SF Bathroom en esta fase, o preparamos también DOT Surfaces
y Fuxsabany?

**Q22. Marketing y Financiero.** ¿Conseguimos el Excel histórico (>10 años) y las cuentas?
¿Import manual con tu equipo o esperamos al workflow n8n?

**Q23. Seguro de crédito.** ¿Existe póliza? Si sí, ¿de dónde sacamos el saldo cubierto por
cliente (manual/Excel)?

**Q24. Efectos/impagados.** ¿El ERP registra efectos e impagos confirmados? Si no, ¿marcamos
los impagados a mano en `cobros`?

---

## 4. Alcance y funcionamiento de la app

**Q25. Prioridad de construcción.** Ordénalos del 1 (primero) al 6:
- ___ Ciclo de crédito: cobros/DSO completo (B8) + ticket, plazos y cumplimiento de fecha (B2)
- ___ Rentabilidad: margen por pedido/comercial/canal + ranking (B3) + margen y presupuesto por comercial (B9)
- ___ Servicio y stock: rotación, fill rate, stock muerto, venta perdida (B4)
- ___ Fuga y crecimiento: evolución individual, cohortes (B5) + canal/marca completo (B6)
- ___ Riesgo: top 20, evolución concentración, riesgo de proveedor (B7)
- ___ Calidad: devoluciones por referencia/familia, coste con margen (B10)
- ___ Transversal: filtros por dimensión, export a Excel, drill-down (al final, toca todas las páginas)

**Q26. Vistas temporales.** ¿Se construyen ya diaria/semanal/12M rodante/proyección de cierre,
o se añaden cuando el ERP real las alimente (mientras tanto seguimos con mensual + acumulado)?

**Q27. Drill-down.** ¿Basta con abrir la factura/pedido origen dentro de la app ahora, o se
espera al ERP?

**Q28. Alertas por correo.** ¿Dirección(es) de destino y frecuencia (diario al amanecer tras la
carga)? ¿O empezamos con un buzón dentro de la app?

---

## 5. Confirmación de esquema (cambio técnico, 1 min)

**Q29.** ¿Añadimos a `incidencias` el lote/compra de origen y la fecha de cierre, para poder
medir devoluciones por lote y plazo de resolución?
- a) Sí [RECOMENDADO] b) No