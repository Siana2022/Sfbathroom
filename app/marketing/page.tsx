import ModuleCard from '@/components/ModuleCard';

export default function MarketingPage() {
  return (
    <div>
      <h1>Marketing Mix Modeling</h1>
      <ModuleCard
        titulo="Inversión por canal y ventas semanales"
        estado="listo"
        descripcion="Solo canales offline (comerciales, call center, ferias). Hay más de 10 años de histórico en Excel del departamento financiero — buena base para el MMM. Falta definir el proceso de carga desde ese Excel."
        tablas={['marketing_canales', 'marketing_inversion', 'ventas_semanales']}
      />
    </div>
  );
}
