# Mejoras propuestas · sfbathroom BI

Lista priorizada por bloques. Esfuerzo: **S** (horas), **M** (1-2 días), **L** (varios días).

---

## 1. Zona del comercial

### 1.1 Ficha del cliente
| Mejora | Por qué | Esf. |
|---|---|---|
| Historial de contacto unificado (visitas A3ERP + llamadas/notas) | Hoy el seguimiento está repartido | M |
| Pestaña “Seguimiento” con timeline | Ver la relación completa de un vistazo | M |
| Notas internas del comercial por cliente | Contexto que no está en ningún ERP | S |
| Adjuntar documentos al cliente (ofertas, planos) | Evita depender del correo | M |
| Comparativa del cliente vs su grupo | Negociación con datos | S |
| Alertas propias del cliente (marca “vigilar”) | Seguimiento sin ruido | S |
| Precio pactado vs aplicado en la última compra | Detectar desviaciones | M |

### 1.2 Agenda
| Mejora | Por qué | Esf. |
|---|---|---|
| Vista semanal/mensual con arrastrar para reprogramar | Más rápido que abrir cada reunión | M |
| Plantillas de reunión (checklist por tipo) | Uniformidad en visitas | S |
| Recordatorio al comercial (push/email) el día antes | Menos olvidos | S |
| Resumen automático post-reunión (IA) | Ahorra redacción | M |
| Duración y ubicación de la reunión | Planificación real | S |
| Historial de cambios de fecha | Saber cuántas veces se pospone | S |

### 1.3 Alertas
| Mejora | Por qué | Esf. |
|---|---|---|
| Alertas por email/WhatsApp al comercial | Hoy solo dentro de la app | S |
| Configurar umbrales por comercial | Cada cartera es distinta | M |
| “Recordar en X días” sobre una alerta | Cierra el bucle | S |
| Historial de alertas gestionadas | Saber qué se hizo | S |

### 1.4 Email marketing
| Mejora | Por qué | Esf. |
|---|---|---|
| Métricas de apertura y clic (webhooks Resend/SES) | Saber qué funciona | M |
| Envío con SES (ya preparado) | Coste casi cero | S |
| Programación por franjas horarias | Mejor apertura | S |
| Test A/B de asunto | Mejorar resultados | M |
| Biblioteca de imágenes | Reutilizar creatividades | S |
| Plantillas por campaña (bienvenida, reactivación…) | Arrancar rápido | S |

### 1.5 Comercial → cliente
| Mejora | Por qué | Esf. |
|---|---|---|
| Crear pedido/oferta desde la app | Hoy solo consulta | L |
| Compartir ficha o informe en PDF | Enviar al cliente | S |
| Mapa de clientes por zona | Planificar rutas | M |
| Objetivos por familia o línea | Gestión más fina | M |

---

## 2. Dirección

| Mejora | Por qué | Esf. |
|---|---|---|
| Comparativa entre comerciales (ranking completo) | Hoy el comercial solo ve su posición | S |
| Informe mensual automático en PDF | Ahorra preparación | M |
| Previsión de cierre a partir de pedidos y pipeline | Anticipación | M |
| Cuadro de mando configurable (arrastrar KPIs ya existe) | Extenderlo | S |
| Alertas de dirección (caída de margen, cliente grande en riesgo) | Reacción temprana | M |
| Consolidado holding SF + FUX + DOT con detalle | Visión de grupo | L |

---

## 3. Datos e ingesta

| Mejora | Por qué | Esf. |
|---|---|---|
| Un solo `.bat` de ingesta con log unificado | Mantenimiento | S |
| Panel de estado de ingestas (última carga, errores) | Confianza en el dato | S |
| Cargas incrementales (no recargar años) | Menos tiempo y carga | M |
| Líneas de pedido desde histórico (`LINEALBH`) | 5 pedidos sin detalle | S |
| Descuentos por cliente (`DESCUENT`/`DESCUENTESP`) | Condiciones completas | M |
| Zoho CRM: usuarios → comerciales, cuentas → clientes | Migración ordenada | L |
| Zoho CRM: actividades y notas al timeline | Seguimiento completo | L |
| Validación automática de descuadres (facturas vs líneas) | Calidad del dato | M |

---

## 4. Rendimiento

| Mejora | Por qué | Esf. |
|---|---|---|
| Caché en Clientes (hecho) y extenderla a Pedidos y Facturación | Navegación repetida instantánea | S |
| RPC único `clientes_panel` | Primera carga de ~0,9 s a ~0,3 s | M |
| Revisar secciones con `todasLasFilas` (98 usos) | Evitar traer tablas completas | M |
| Índices por consulta real (hecho parcial) | Consultas más rápidas | S |
| Precarga de la ficha al pasar el ratón | Sensación de inmediatez | S |
| Medición continua (`/admin/rendimiento`) | Detectar regresiones | S |

---

## 5. Seguridad y auditoría

| Mejora | Por qué | Esf. |
|---|---|---|
| H-2: reparar historial de migraciones | Evitar deriva | S |
| H-4: Leaked Password Protection | Protección de cuentas | S |
| H-3: mover `auth_role` a esquema `private` | Superficie de ataque | L |
| Registro de accesos y cambios sensibles | Trazabilidad | M |
| Doble factor para admin/dirección | Cuentas críticas | M |
| Política de contraseñas y caducidad | Cumplimiento | S |

---

## 6. Experiencia de uso

| Mejora | Por qué | Esf. |
|---|---|---|
| Búsqueda global con resultados agrupados (hoy existe básica) | Encontrar rápido | S |
| Atajos de teclado en tablas y filtros | Usuarios intensivos | S |
| Guardar vistas/filtros favoritos | Repetir análisis | M |
| Exportar a Excel en todas las tablas | Trabajo fuera de la app | S |
| Modo móvil para agenda y ficha | Comercial en la calle | M |
| Notificaciones push (ya hay infra PWA) | Avisos reales | S |
| Onboarding inicial por rol | Adopción | S |

---

## 7. Técnico / deuda

| Mejora | Por qué | Esf. |
|---|---|---|
| Cerrar PRs antiguos (#3, #32) | Limpieza | S |
| Tests de las RPC críticas | Evitar regresiones | M |
| Unificar criterios de fecha/ejercicio | Consistencia | S |
| Documentar cada módulo en `/docs` | Traspaso | S |
| Revisar `todasLasFilas` y sustituir por agregados | Rendimiento | L |
| Migrar correo interno a SES también | Ahorro | S |

---

## Orden recomendado (fases)

**Fase 1 (valor inmediato, 1-2 semanas)**
1. Caché en Pedidos y Facturación.
2. Alertas por email al comercial.
3. Métricas de email marketing + SES.
4. Historial de contacto unificado (A3ERP).
5. Exportar a Excel en las tablas principales.

**Fase 2 (seguimiento completo)**
6. Zoho CRM: usuarios y cuentas.
7. Timeline unificado en la ficha.
8. Notas y adjuntos por cliente.
9. Plantillas de reunión y recordatorios.

**Fase 3 (dirección y escala)**
10. Ranking completo y previsiones.
11. Informes automáticos en PDF.
12. Consolidado holding.
13. Seguridad (MFA, registro de accesos).

**Fase 4 (producto)**
14. Pedidos/ofertas desde la app.
15. Mapa de clientes.
16. Previsión y pipeline.
