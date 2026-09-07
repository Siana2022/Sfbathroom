import ModuleCard from '@/components/ModuleCard';

export default function MargenPage() {
  return (
    <div>
      <h1>Margen por producto</h1>
      <ModuleCard
        titulo="Margen por artículo"
        estado="listo"
        descripcion="Vista v_margen_por_articulo calculada automáticamente a partir de precio de venta y coste unitario. El coste ya existe en A3ERP (estándar por medida) — falta cargarlo para que el margen deje de ser cero. El cliente quiere margen a nivel de línea, pedido, cliente y comercial."
        tablas={['articulos.coste_unitario', 'factura_lineas.coste_unitario', 'v_margen_por_articulo (vista)']}
      />
    </div>
  );
}
