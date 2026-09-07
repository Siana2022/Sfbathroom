import ModuleCard from '@/components/ModuleCard';

export default function ComercialPage() {
  return (
    <div>
      <h1>Comercial</h1>
      <ModuleCard
        titulo="Facturación, artículos y comerciales"
        estado="listo"
        descripcion="Estructura lista para facturas, líneas de factura, clientes, comerciales y artículos. Pendiente de conectar A3ERP (SQL Server, actualización diaria) para poblarla con datos reales y activar los filtros por rango de fechas, comercial y artículo."
        tablas={['facturas', 'factura_lineas', 'clientes', 'comerciales', 'articulos', 'familias_articulo']}
      />
    </div>
  );
}
