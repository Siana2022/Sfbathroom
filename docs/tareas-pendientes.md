# Backlog

Orden sugerido, no estricto — reordena si el cliente marca otra prioridad.

## 0. Migración del cuadro de mando (0003)
- [x] Aplicar `0003` en Supabase (hecho por el cliente).
- [x] Aplicar `0004` (fix recursión RLS + escalada de rol) y crear superusuarios.
- [x] Shell de navegación con los 11 bloques y selector de empresa.

## 0b. Datos de demostración
- [ ] Cargar `docs/datos-demo.sql` en el SQL editor (escenario ficticio generado por
      `scripts/datos-demo.mjs`: 3 comerciales, 16 clientes, 7 familias, 36 artículos,
      655 facturas, pedidos, compras a China, stock, cobros, incidencias, presupuesto).
      Es reejecutable (`on conflict do nothing`) y no toca `profiles`/auth.
- [ ] Construir las páginas de datos: Resumen + Facturación (B1) primero, luego el resto.

## 1. Autenticación y perfiles
- [x] Activar Supabase Auth (email/password basta, es un único usuario por ahora).
- [x] Página de login en Next.js + middleware que proteja todas las rutas salvo `/login`.
- [x] Shell de navegación con los 11 bloques y selector de empresa (commit `292fd7a`).
- [ ] Aplicar la migración `0004_fix_recursion_y_escalada_roles.sql` en el SQL editor de
      Supabase (fix recursión RLS + cierre de escalada de rol). Bloquea cualquier página con
      datos; la portada ya falla tras el login hasta que se aplique.
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
- [ ] Vincular este repo a un repositorio Git remoto (GitHub) para habilitar despliegue
      automático en cada push (hoy el deploy de Vercel es manual, sin Git).
- [ ] Evaluar si en algún momento compensa activar "Link API | a3ERP" (tiempo real, de pago)
      en vez del workflow n8n nocturno — no es necesario mientras la actualización diaria
      sea suficiente para el cliente.
