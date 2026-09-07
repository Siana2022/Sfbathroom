import Link from 'next/link';
import { cookies } from 'next/headers';
import { getDocumentos } from '@/lib/datos/documentos';
import { parseFiltros, getOpcionesFiltros, type SearchParams } from '@/lib/datos/filtros';
import { decimal, eur } from '@/lib/formato';
import Filtros from '@/components/Filtros';

export const dynamic = 'force-dynamic';

const ANIO = 2026;
const POR_PAGINA = 50;

export default async function DocumentosPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const filtros = parseFiltros(searchParams);
  const opciones = await getOpcionesFiltros(empresa);
  const pagina = Math.max(1, Number(searchParams.pagina ?? 1) || 1);
  const d = await getDocumentos(empresa, ANIO, filtros, pagina, POR_PAGINA);

  const paginas = Math.max(1, Math.ceil(d.total / d.porPagina));
  const base = new URLSearchParams();
  if (filtros.cliente) base.set('cliente', filtros.cliente);
  if (filtros.comercial) base.set('comercial', filtros.comercial);
  if (filtros.familia) base.set('familia', filtros.familia);
  if (filtros.marca) base.set('marca', filtros.marca);
  if (filtros.desde) base.set('desde', filtros.desde);
  if (filtros.hasta) base.set('hasta', filtros.hasta);
  const va = `?${base.toString()}${base.size ? '&' : ''}pagina=`;

  const fechaLarga = (f: string) =>
    new Date(`${f}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Transversal</p>
      <h1>Documentos origen</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Listado de facturas, abonos y notas de cargo de {d.empresa.nombre} en {d.anio}. Entra en un
        documento para ver sus líneas (artículo, familia, marca) y el origen: pedido, albarán y
        abonos cruzados.
      </p>

      <Filtros opciones={opciones} />

      <div className="card">
        <h2>{d.total} documentos · página {pagina} de {paginas}</h2>
        {d.documento.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin documentos con los filtros actuales.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nº documento</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Comercial</th>
                  <th className="td-num">Líneas</th>
                  <th className="td-num">Importe</th>
                </tr>
              </thead>
              <tbody>
                {d.documento.map((doc) => (
                  <tr key={doc.id}>
                    <td>{fechaLarga(doc.fecha)}</td>
                    <td>
                      <Link href={`/documentos/${doc.id}`} className="doc-enlace">
                        {doc.numero}
                      </Link>
                    </td>
                    <td>{doc.tipo}</td>
                    <td>{doc.cliente}</td>
                    <td>{doc.comercial}</td>
                    <td className="td-num">{decimal(doc.lineas, 0)}</td>
                    <td className="td-num">{eur(doc.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {pagina > 1 ? (
              <Link className="boton" href={`${va}${pagina - 1}`}>
                ← Anterior
              </Link>
            ) : (
              <span className="boton" aria-disabled>
                ← Anterior
              </span>
            )}
            {pagina < paginas ? (
              <Link className="boton" href={`${va}${pagina + 1}`}>
                Siguiente →
              </Link>
            ) : (
              <span className="boton" aria-disabled>
                Siguiente →
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}