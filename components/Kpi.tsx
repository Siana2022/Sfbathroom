type Props = {
  etiqueta: string;
  valor: string;
  nota?: string;
};

export default function Kpi({ etiqueta, valor, nota }: Props) {
  return (
    <li className="kpi">
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor">{valor}</strong>
      {nota ? <span className="kpi-nota">{nota}</span> : null}
    </li>
  );
}