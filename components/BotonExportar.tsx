'use client';

export default function BotonExportar({
  nombre,
  cabeceras,
  filas,
}: {
  nombre: string;
  cabeceras: string[];
  filas: (string | number | null)[][];
}) {
  function descargar() {
    const escapar = (v: string | number | null) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cabeceras.map(escapar).join(';'), ...filas.map((f) => f.map(escapar).join(';'))].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombre}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="boton" onClick={descargar}>
      Exportar a Excel
    </button>
  );
}
