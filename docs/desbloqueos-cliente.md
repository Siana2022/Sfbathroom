# Qué necesita el cliente para desbloquear pendientes

Recopilación única de todos los datos/información que debe aportar el cliente para
desbloquear los pendientes que dependen de él. Ordenados por bloque.

## B4 — Stock (avanzado)

- [ ] **Histórico de fotos de stock** desde A3ERP (con fecha) → alimenta
      `stock_fotos`, cobertura por estacionalidad y evolución mensual del inmovilizado.
- [ ] Confirmar alertas de rotura: prioridad del cliente (tabla + cron diario + email/Slack).

## B8 — Crédito y cobros (avanzado)
- [ ] **Impagos y devoluciones de efectos** (Q24): import manual vía Excel a `cobros`
      con `impagado = true`, o tabla `devoluciones_efectos`. El cliente confirmó que el
      banco (EFECTAS) genera listados mensuales → el proceso sería import periódico.
- [ ] **Q23 — Cobertura de seguro de crédito**: qué compañía, en qué lista de riesgos
      aprobados están sus clientes, y si quiere ver la cobertura por cliente cruzada con el
      límite de crédito usado.

## Marketing (bloque 4)
- [ ] **Excel histórico del departamento financiero** (>10 años de inversión por canal
      offline: comerciales, call center, ferias) → import a `marketing_inversion` /
      `ventas_semanales` para arrancar el MMM.

## Financiero (bloque 5)
- [ ] **Validar el set de KPIs propuesto** (página Financiero): liquidez corriente, quick
      ratio, endeudamiento, solvencia, fondo de maniobra, EBITDA y margen EBITDA, ROA, ROE,
      CCC (cash conversion cycle). Hoy no calculan ninguno.
- [ ] **Excel/PDF de la gestoría con cuentas anuales** → `financiero_cuentas_anuales`
      (balance, P&G, flujo de caja). Cierre mensual; cargar 3-5 ejercicios históricos.
- [ ] Acceso/nominales para el DSO por banco si lo quiere por método de cobro.

## A3ERP (bloque 2, transversal)
- [ ] **Credenciales SQL Server** (servidor, BD, usuario de solo lectura) — el `.pbix`
      actual es un atajo rápido para localizar el cubo de Ventas.
- [ ] **Accesibilidad de red**: VPN o regla de firewall para la IP de n8n.
- [ ] Confirmar si existen más cubos de BI en A3ERP además del de Ventas (stock/almacén).
- [ ] (Wrap-up) manejo de abonos/devoluciones en el conector.

## Consolidada holding (B12)
- [ ] **Datos de DOT y Fuxsabany** para poder cargarlos en demo y que la consolidada de
      holding (SF + DOT + Fuxsabany) muestre números reales. Requiere definir quién los
      provee y con qué formato (¿mismo esquema que SF? ¿Excel a `facturas`?)