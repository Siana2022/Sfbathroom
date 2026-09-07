import ModuleCard from '@/components/ModuleCard';

export default function StockPage() {
  return (
    <div>
      <h1>Stock</h1>
      <ModuleCard
        titulo="Existencias por almacén (3 almacenes)"
        estado="listo"
        descripcion="Tabla de stock actual por artículo/almacén, más un histórico de movimientos para auditoría. El cliente confirmó que actualización diaria es suficiente. Prioridad: alertas de rotura de stock, más que solo visibilidad de cantidades."
        tablas={['stock_actual', 'stock_movimientos', 'almacenes']}
      />
    </div>
  );
}
