import Link from 'next/link';
import { EMPRESAS } from '@/lib/empresas';

type Params = Record<string, string | string[] | undefined> | undefined;

/**
 * Pestañas «Todas · SF · DOT · FUX» para acotar una pantalla sin tocar el selector
 * de la cabecera. Conserva el resto de parámetros de la URL (filtros).
 */
export default function ChipsEmpresa({
  actual,
  searchParams,
  ruta,
}: {
  actual: string | null;
  searchParams?: Params;
  ruta: string;
}) {
  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (k !== 'empresa' && typeof v === 'string') base.set(k, v);
  }
  const href = (codigo?: string) => {
    const p = new URLSearchParams(base);
    if (codigo) p.set('empresa', codigo);
    const qs = p.toString();
    return qs ? `${ruta}?${qs}` : ruta;
  };
  const opciones: { codigo: string | null; etiqueta: string }[] = [
    { codigo: null, etiqueta: 'Todas' },
    ...EMPRESAS.map((e) => ({ codigo: e.codigo as string, etiqueta: e.codigo })),
  ];

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Empresa:</span>
      {opciones.map((o) => (
        <Link
          key={o.etiqueta}
          href={href(o.codigo ?? undefined)}
          className={`boton${(actual ?? null) === o.codigo ? ' boton-primario' : ''}`}
        >
          {o.etiqueta}
        </Link>
      ))}
    </div>
  );
}
