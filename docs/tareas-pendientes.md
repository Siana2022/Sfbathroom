# Backlog

Orden sugerido, no estricto — reordena si el cliente marca otra prioridad.

## 0. Auditoría de seguridad (7 sep 2026)

Auditoría externa de repo vs producción (`dgbxualxhrbbqglvxtxq`). Estado:
- [x] **H-1 (crítico)** — 5 vistas (`v_aging`, `v_saldo_clientes`, `v_stock_cobertura`,
      `v_consumo_diario`, `v_coste_completo_por_lote`) corrían sin `security_invoker` y
      esquivaban la RLS. Aplicada la migración `0007` (alter view set). Verificado: las 6
      vistas muestran `["security_invoker=true"]`.
- [ ] **H-2 (alto)** — deriva de migraciones: `supabase_migrations.schema_migrations` solo
      registra 0001–0002 con el esquema real al 0006. Fijar con
      `supabase migration repair --status applied 0003 0004 0005 0006`. Ojo: la 0006 ya
      lleva `ON CONFLICT`, no duplicaría seeds.
- [ ] **H-3 (medio)** — `auth_role()`/`auth_comercial_id()` expuestas vía RPC. Diferido:
      mover a esquema `private` (toca todas las políticas RLS).
- [ ] **H-4 (bajo)** — activar Leaked Password Protection en Supabase Auth (un clic).
- [x] **H-5 (bajo)** — CI: `opencode.yml` fijado a SHA `02a167e0…` (v1.18.29).

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
- [x] Filtros cruzados por dimensión en cada bloque (URL params cliente/comercial/familia/
      marca/fechas; `lib/datos/filtros.ts` + `components/Filtros.tsx`, aplicados en las 10
      páginas de datos, commit `fb64a4c`).
- [x] Exportación de cualquier vista a Excel: helper `lib/csv.ts` + componente
      `DescargarExcel` en Facturación, Clientes, Margen, Alertas, Pedidos, Stock,
      Concentración, Crédito-Cobro, Calidad, Canal y Marca y Actividad comercial.
- [ ] Drill-down hasta el documento origen (factura, línea, pedido).
- [ ] Consolidada de holding (SF + DOT + Fuxsabany en un mismo número).
- [x] Vistas semanal (ISO) y diaria; 12 meses rodantes y proyección de cierre (Q26) — página
      de facturación (`lib/datos/vistas.ts`, `app/facturacion`).
- [x] Cerrar reglas de negocio 0.2 con dirección (portes a parte, cliente activo 12M, perdido
      12M sin facturar tras 12M con, tipo de cambio del pedido) — ver
      `docs/cuestionario-cliente.md` Q1–Q4, Q7 y Q8–Q19 (umbrales confirmados).
- [x] Definir umbrales de alertas iniciales (confirmados Q8–Q19) y hacerlos configurables
      desde interfaz: migración `0006` siembra `alertas_config`; `app/configuracion` con
      editor (solo admin/direccion por RLS); `lib/datos/alertas.ts` usa los umbrales
      configurados. Queda aplicar `0006`.
- [~] Márgenes visibles solo para dirección/financiero: migración `0005` (vista margen con
      `security_invoker` + RLS) y gating por rol en `app/margen`. Aplicada por el cliente.
- [x] Aviso de clientes no activos (Q2) visible en la página de clientes y como señal en
      `lib/datos/alertas.ts` (señal "Clientes activos sin pedidos en 12 meses").
- [x] Coste de transporte anual como métrica propia, fuera de la neta (Q1).

### Bloques
- B1: [x] métricas base + mensual vs previo + presupuesto. [x] análisis de variación en
      página (tarjetas "¿De dónde viene la variación" y "Efecto por tipo de cliente"),
      semanal/diaria/12M/proyección, desvío presupuesto por comercial/cliente/familia
      (`lib/datos/desvioPresupuesto.ts`, commit `fb64a4c`).
- B2: [x] ticket medio de pedido, cartera por fecha solicitada, motivo de anulación,
      modificaciones, plazo pedido→entrega, cumplimiento de fecha prometida (commit del
      paquete Ciclo de crédito).
- B3: [x] margen por unidad, por factura (tramos), por comercial, por marca/canal/país y
      cliente, matriz margen×rotación, ranking por margen, erosión de tarifa, evolución
      mensual. [ ] evolución 12M rodante con alerta ya cubierta en B11 (señal de margen por
      debajo de objetivo); añadir filtros cruzados cuando estén (transversal).
- B4: [x] valor, en tránsito, cobertura media, roturas, bajo punto. [x] rotación, fill rate,
      venta perdida, stock muerto/baja rotación, propuesta de aprovisionamiento, cruce
      cobertura×cartera. [ ] cobertura por estacionalidad y evolución mensual del inmovilizado
      (necesitan histórico de fotos de stock desde A3ERP, ver `docs/exportacion-a3erp.md`).
- B5: [x] matriz cliente×familia, semáforo de fuga, definiciones Q2/Q3 aplicadas (activo por
      pedido 12M, aviso de clientes sin actividad, perdido 12M), evolución individual por
      delta (12M vs 12M previos), cohortes mensuales con retención.
- B6: [x] margen y unidades por segmento, crecimiento YoY, peso 12M en rodante, diferencial
      de margen SB vs MB, marca blanca por cliente-fabricante (`lib/datos/canalMarca.ts` +
      página canal-y-marca, incluida exportación a Excel).
- B7: [x] top 20, concentración de producto (3 familias / 20 refs / nº refs que dan el 80%),
      concentración geográfica por país, matriz cliente×familia de riesgo, riesgo de
      proveedor (chino, sin alternativas, plazos reales y pactados vs 75 días).
- B8: [x] desvío DSO vs 30 días, DSO por cliente y su evolución, riesgo vivo vs límite de
      crédito (commit del paquete Ciclo de crédito); cobertura de seguro de crédito a la
      espera de Q23. [ ] impagos/devoluciones de efectos (manual vía Excel, Q24).
- B9: [x] facturación, clientes, descuento medio, pedidos por persona. [x] margen aportado,
      cumplimiento presupuesto (vs `presupuesto` acumulado), nuevos/perdidos frente al año
      anterior, saturación por comercial (umbrales configurables `comerciales.saturacion_*`).
      [ ] carga SF+DOT consolidada (depende de cargar datos DOT en demo).
- B10: [x] devoluciones por referencia y familia en unidades, margen perdido, incidencias por
      motivo/cliente/estado. [ ] plazo de resolución (funciona en la página, pero los datos
      demo no traen `fecha_cierre`; con A3ERP ya se puede nutrir, Q29). [ ] devoluciones por
      lote (requiere que A3ERP mariage lote en línea de factura).
- B11: [x] señales calculadas + alertas_generadas. [x] umbrales configurables desde interfaz
      (`app/configuracion` + migración `0006`, aplicada); [x] disparadores restantes calculados desde la
      configuración (saturación Q6, proveedor con retraso, DSO al alza, familia dependiente de
      cliente, erosión de precio, clientes no activos Q2). [ ] envío por correo y generación
      automática de `alertas_generadas`.
- B12: [x] cuadros de mando por perfil y cadencia (operativa/comercial/estratégica/holding)
      + consolidada de holding por estado (commit `7c8db83`).

## 1. Autenticación y perfiles
- [x] Activar Supabase Auth (email/password basta, es un único usuario por ahora).
- [x] Página de login en Next.js + middleware que proteja todas las rutas salvo `/login`.
- [x] Shell de navegación con los 11 bloques y selector de empresa (commit `292fd7a`).
- [x] Migración `0004` aplicada (fix recursión RLS + cierre de escalada de rol).
- [x] PWA (manifest, service worker, iconos, theme-color) — pedida por el cliente el 7 sep 2026.
- [~] Usuarios creados por el cliente vía Authentication → Users (trigger crea `profiles` con
      rol `lectura`); falta asignar rol/cartera con `docs/asignar-roles-usuarios.sql` y
      verificar la matriz (`docs/usuarios-y-roles.md`).
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
