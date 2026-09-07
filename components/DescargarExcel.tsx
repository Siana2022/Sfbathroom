'use client';
import { aCsv, type Celda } from '@/lib/csv';

type Props = {
  nombre: string;
  columnas: string[];
  registros: Celda[][];
  etiqueta?: string;
};

export default function DescargarExcel({ nombre, columnas, registros, etiqueta = 'Exportar a Excel' }: Props) {
  function descargar() {
    const blob = new Blob([aCsv(columnas, registros)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombre}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  return (
    <button className="boton" onClick={descargar}>
      {etiqueta}
    </button>
  );
}