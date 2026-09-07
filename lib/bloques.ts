export type Bloque = {
  numero: string;
  slug: string;
  titulo: string;
  resumen: string;
  metricas: string[];
};

export const bloques: Bloque[] = [
  {
    numero: '1',
    slug: '/facturacion',
    titulo: 'Facturación',
    resumen: 'Núcleo del cuadro: facturación neta, unidades, precio medio, ticket por factura. Vistas diaria, semanal, mensual, anual, 12 meses rodantes y proyección de cierre.',
    metricas: ['Facturación neta', 'Unidades facturadas', 'Precio medio de venta', 'Ticket medio por factura', 'Presupuesto y desviación'],
  },
  {
    numero: '2',
    slug: '/pedidos',
    titulo: 'Pedidos y cartera',
    resumen: 'Captación de pedidos, cartera pendiente de servir, antigüedad, ratio pedidos/facturación, anulaciones y cumplimiento de fecha prometida.',
    metricas: ['Pedidos captados', 'Cartera pendiente de servir', 'Antigüedad de la cartera', 'Ratio pedidos / facturación', 'Pedidos anulados y modificados'],
  },
  {
    numero: '3',
    slug: '/margen',
    titulo: 'Margen y rentabilidad',
    resumen: 'Margen con coste completo de llegada por lote: flete, aduana, seguro, transporte interior, tipo de cambio y roturas.',
    metricas: ['Coste completo por lote', 'Margen bruto € y %', 'Margen por artículo y familia', 'Margen por cliente y comercial', 'Pedidos bajo margen objetivo'],
  },
  {
    numero: '4',
    slug: '/stock',
    titulo: 'Stock y cobertura',
    resumen: 'Cobertura en días, stock disponible real, en tránsito, roturas, fill rate y propuesta de pedido de aprovisionamiento.',
    metricas: ['Cobertura en días', 'Stock disponible real', 'Stock en tránsito', 'Roturas y venta perdida', 'Referencias bajo punto de pedido'],
  },
  {
    numero: '5',
    slug: '/clientes',
    titulo: 'Comportamiento de cliente',
    resumen: 'Clientes activos, nuevos, recuperados y perdidos. Retención, frecuencia de pedido, semáforo de fuga y análisis de cohortes.',
    metricas: ['Clientes activos / nuevos / perdidos', 'Tasa de retención', 'Semáforo de fuga', 'Matriz cliente × familia', 'Cohortes por año de captación'],
  },
  {
    numero: '6',
    slug: '/canal-y-marca',
    titulo: 'Canal y marca',
    resumen: 'Starbath Plus frente a marca blanca: facturación, margen, clientes, referencias y evolución. % Starbath Plus como indicador estratégico.',
    metricas: ['% de facturación Starbath Plus', 'Diferencial de margen vs marca blanca', 'Facturación por canal', 'Marca blanca por cliente-fabricante'],
  },
  {
    numero: '7',
    slug: '/concentracion',
    titulo: 'Concentración y riesgo',
    resumen: 'Concentración de clientes, producto y mercado. Matriz cliente × familia de riesgo, riesgo de proveedor y curva de Pareto.',
    metricas: ['% top 1 / 3 / 10 / 20', 'Índice de Herfindahl', 'Pareto de clientes', 'Matriz cliente × familia de riesgo', 'Riesgo de proveedor'],
  },
  {
    numero: '8',
    slug: '/credito-cobro',
    titulo: 'Crédito y cobro',
    resumen: 'Saldo de clientes, DSO real y frente a los 30 días pactados, aging de la deuda, vencidos e impagos.',
    metricas: ['DSO real y desvío', 'Aging: al día · 1-30 · 31-60 · 61-90 · +90', 'Vencido total y por cliente', 'Límite de crédito vs riesgo vivo'],
  },
  {
    numero: '9',
    slug: '/actividad-comercial',
    titulo: 'Actividad comercial',
    resumen: 'Carga por persona en SF + DOT, clientes gestionados, margen aportado, descuentos aplicados e indicador de saturación.',
    metricas: ['Facturación total gestionada SF + DOT', 'Clientes activos por comercial', 'Descuento medio aplicado', 'Saturación del equipo'],
  },
  {
    numero: '10',
    slug: '/calidad',
    titulo: 'Calidad y devoluciones',
    resumen: 'Devoluciones sobre facturación por motivo, cliente, referencia y lote de proveedor. Coste de incidencias y reclamaciones abiertas.',
    metricas: ['% de devoluciones', 'Por motivo: rotura, defecto, error de pedido/expedición, rechazo', 'Por cliente y por referencia', 'Coste de incidencias'],
  },
  {
    numero: '11',
    slug: '/alertas',
    titulo: 'Alertas',
    resumen: 'Avisos configurables por umbral: fuga de clientes, rotura de stock, margen bajo objetivo, DSO al alza, vencidos y concentración.',
    metricas: ['Cliente en riesgo de fuga', 'Rotura de stock inminente', 'Pedido bajo margen objetivo', 'Vencido relevante', 'Desviación de presupuesto'],
  },
];

export const otrosModulos = [
  { slug: '/marketing', titulo: 'Marketing (MMM)' },
  { slug: '/financiero', titulo: 'Financiero' },
];

export function obtenerBloque(slugHref: string) {
  return bloques.find((b) => b.slug === slugHref) ?? null;
}