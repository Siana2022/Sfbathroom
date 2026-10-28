import Link from 'next/link';

type Props = {
  etiqueta: string;
  valor: string;
  nota?: string;
  /** Si se indica, la nota es un enlace: sirve para llevar al listado filtrado. */
  notaHref?: string;
};

export default function Kpi({ etiqueta, valor, nota, notaHref }: Props) {
  return (
    <li className="kpi">
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor">{valor}</strong>
      {nota ? (
        notaHref ? (
          <Link className="kpi-nota kpi-nota-enlace" href={notaHref}>
            {nota}
          </Link>
        ) : (
          <span className="kpi-nota">{nota}</span>
        )
      ) : null}
    </li>
  );
}
