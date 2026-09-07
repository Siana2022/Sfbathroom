import ModuleCard from '@/components/ModuleCard';

export default function FinancieroPage() {
  return (
    <div>
      <h1>Financiero</h1>
      <ModuleCard
        titulo="Cuentas anuales, flujo de caja y balance"
        estado="listo"
        descripcion="Estructura genérica de partidas contables por ejercicio (balance, P&G, flujo de caja) más una tabla de KPIs financieros. Sin API disponible — carga prevista desde Excel de la gestoría, cierre mensual, cargar 3-5 ejercicios históricos. Ningún KPI calculado hoy: hay que definirlos con el cliente."
        tablas={['financiero_cuentas_anuales', 'financiero_kpis']}
      />
    </div>
  );
}
