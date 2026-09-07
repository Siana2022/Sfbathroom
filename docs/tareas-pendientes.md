# Backlog

Orden sugerido, no estricto — reordena si el cliente marca otra prioridad.

## 0. Migración del cuadro de mando (0003)
- [x] Aplicar `0003` en Supabase (hecho por el cliente).
- [x] Aplicar `0004` (fix recursión RLS + escalada de rol) y crear superusuarios.
- [x] Shell de navegación con los 11 bloques y selector de empresa.

## 0b. Datos de demostración
- [x] Cargar `docs/datos-demo.sql` en el SQL editor (escenario ficticio generado por
      `scripts/datos-demo.mjs`: 3 comerciales, 16 clientes, 7 familias, 36 artículos,
      655 facturas, pedidos, compras a China, stock, cobros, incidencias, presupuesto).
      Es reejecutable (`on conflict do nothing`) y no toca `profiles`/auth.
- [x] Construir las páginas de los 11 bloques con datos (commits `e902c4b` y `44045d3`).
      Marketing y Financiero siguen como placeholder (sin tablas con datos demo).

## 0c. Cobertura del Word (`docs/especificacion-comercial.md`) — estado a `44045d3`

Matriz de lo que pide la especificación frente a lo construido. Los niveles base de cada
bloque están; quedan los análisis avanzados, filtros y vistas. Marcar aquí el avance.

### Transversal
- [x] Multiempresa (selector `sfb_empresa`, app-side; esquema con `empresa_id`).
- [x] Perfiles de acceso por RLS (7 roles).
- [x] Dimensiones en esquema: tiempo, cliente, geografía, comercial, producto, marca/canal,
      documento.
- [ ] Filtros cruzados por dimensión en cada bloque.
- [ ] Exportación de cualquier vista a Excel.
- [ ] Drill-down hasta el documento origen (factura, línea, pedido).
- [ ] Consolidada de holding (SF + DOT + Fuxsabany en un mismo número).
- [ ] Vistas semanal (ISO) y diaria; 12 meses rodantes y proyección de cierre.
- [ ] Cerrar reglas de negocio 0.2 pendientes con dirección (portes a parte de la neta,
      regla exacta de cliente perdido, tipo de cambio aplicado al coste).
- [ ] Verificar que los márgenes no sean visibles para roles no dirección/financiero.

### Bloques
- B1: [x] métricas base + mensual vs previo + presupuesto. [ ] análisis de variación en
      página (capa de datos hecha en `getVariacion`), semanal/diaria/12M/proyección,
      desvío presupuesto por comercial/cliente/familia.
- B2: [ ] ticket medio de pedido, cartera por fecha solicitada, motivo de anulación,
      modificaciones, plazo pedido→entrega, cumplimiento de fecha prometida.
- B3: [ ] margen por unidad, por pedido/factura, por comercial, por marca/canal/país y
      cliente, matriz margen×rotación, ranking por margen, erosión de tarifa, evolución
      12M con alerta.
- B4: [x] valor, en tránsito, cobertura media, roturas, bajo punto. [ ] rotación, fill rate,
      venta perdida, stock muerto/baja rotación, cobertura por estacionalidad, propuesta de
      aprovisionamiento, cruce cobertura×cartera, evolución mensual del inmovilizado.
- B5: [ ] matriz cliente×familia, semáforo de fuga, frecuencia/último pedido, evolución
      individual ordenada por delta, cohortes.
- B6: [ ] margen y unidades por segmento, crecimiento YoY, peso 12M en rodante, diferencial
      de margen SB vs MB, marca blanca por cliente-fabricante.
- B7: [ ] top 20, concentración de producto (3 familias / 20 refs / nº refs que dan el 80%),
      concentración geográfica por país, matriz cliente×familia de riesgo, riesgo de
      proveedor (chino, sin alternativas, plazos vs 90 días).
- B8: [ ] desvío DSO vs 30 días, DSO por cliente y su evolución, impagos/devoluciones de
      efectos, riesgo vivo vs límite de crédito, cobertura de seguro.
- B9: [x] facturación, clientes, descuento medio, pedidos por persona. [ ] carga SF+DOT
      consolidada, margen aportado, cumplimiento presupuesto, nuevos/perdidos, saturación.
- B10: [ ] devoluciones por referencia/familia/lote y en unidades, coste cruzado con margen,
      plazo de resolución de reclamaciones.
- B11: [x] señales calculadas + alertas_generadas. [ ] umbrales configurables desde interfaz,
      envío por correo, disparadores restantes (fuga top-10, erosión de precio, DSO al alza,
      saturación, retraso de proveedor, familia dependiente de un cliente).
- B12: [ ] cuadros de mando por perfil y cadencia (operativa/comercial/estratégica/holding).

## 1. Autenticación y perfiles
- [x] Activar Supabase Auth (email/password basta, es un único usuario por ahora).
- [x] Página de login en Next.js + middleware que proteja todas las rutas salvo `/login`.
- [x] Shell de navegación con los 11 bloques y selector de empresa (commit `292fd7a`).
- [x] Migración `0004` aplicada (fix recursión RLS + cierre de escalada de rol).
- [ ] Crear usuarios de prueba por rol (`docs/crear-usuarios-prueba.sql`) y verificar la
      matriz de visibilidad (`docs/usuarios-y-roles.md`).
- [ ] Dar de alta al responsable con rol `admin` en `profiles` y borrar los usuarios demo.
- [ ] (Más adelante, no ahora) pantalla simple de administración de usuarios para que el
      cliente pueda dar de alta a financiero/comercial/fabricación sin depender de Siana.

## 2. Conector A3ERP → Supabase
- [ ] Conseguir del cliente: servidor, nombre de base de datos y credenciales SQL Server
      (mirar el `.pbix` actual como atajo — ver `arquitectura.md`).
- [ ] Confirmar accesibilidad de red (VPN / regla de firewall para la IP de n8n).
- [ ] Identificar qué cubos de BI existen en su instalación de A3ERP además del de Ventas
      (¿hay uno de stock/almacén? si no, escribir la consulta SQL directamente contra las
      tablas del ERP).
- [ ] Workflow n8n nocturno: extrae ventas/stock, transforma y hace upsert en `facturas`,
      `factura_lineas`, `clientes`, `comerciales`, `articulos`, `stock_actual`,
      `stock_movimientos`, y (tras la 0003) `pedidos`, `pedido_lineas`, `compras`,
      `compra_lineas`, `stock_en_transito`, `cobros` vía Supabase REST (`service_role key`).
- [ ] Manejar abonos/devoluciones (el cliente confirmó que existen y deben restarse).

## 3. Margen por producto
- [ ] Cargar compras desde A3ERP en `compras`/`compra_lineas` (coste real por lote — la vista
      `v_coste_completo_por_lote` reparte flete/aduana/seguro/transporte y roturas; es la base
      del margen a partir de la 0003).
- [ ] Si no hay compras importables todavía, alimentar `articulos.coste_unitario` como coste
      de referencia provisional (mismo conector que ventas).
- [ ] Validar si hace falta descontar costes indirectos (transporte, comisión comercial) del
      margen — el cliente dijo "se verá cuando conectemos", no está cerrado.
- [ ] Construir vistas/páginas de margen agregado por pedido, cliente y comercial (hoy solo
      existe por artículo vía `v_margen_por_articulo`).

## 4. Stock
- [ ] Definir alertas de rotura de stock (prioridad del cliente sobre solo visibilidad).
- [ ] Decidir mecanismo: ¿tabla + cron diario que compara contra un umbral mínimo por
      artículo, notificación por email/Slack?

## 5. Marketing Mix Modeling
- [ ] Conseguir el Excel histórico (>10 años) del departamento financiero.
- [ ] Diseñar el import (manual vs. automatizado) a `marketing_inversion` /
      `ventas_semanales`.
- [ ] Fase posterior (no en el alcance inmediato): modelo MMM real (p. ej. PyMC-Marketing,
      como en el proyecto SianaHub/SianaPredict) una vez haya datos cargados.

## 6. Financiero
- [ ] Definir con el cliente los KPIs concretos a mostrar (liquidez, EBITDA, DSO, ratio de
      endeudamiento — no calculan ninguno hoy, hay que proponerlos y validarlos).
- [ ] Diseñar el proceso de import desde Excel/PDF de la gestoría (sin API disponible).
- [ ] Cargar 3-5 ejercicios históricos de `financiero_cuentas_anuales`.

## 7. General
- [x] Vincular este repo a GitHub y desplegar automáticamente en cada push (Vercel).
- [ ] Evaluar si en algún momento compensa activar "Link API | a3ERP" (tiempo real, de pago)
      en vez del workflow n8n nocturno — no es necesario mientras la actualización diaria
      sea suficiente para el cliente.
