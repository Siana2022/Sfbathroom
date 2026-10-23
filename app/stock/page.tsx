import { cookies } from 'next/headers';
import { getStockAlmacen } from '@/lib/datos/stockAlmacen';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import type { SearchParams } from '@/lib/datos/filtros';

const TAMANO_PAGINA_VISTA = 100;

function valorParam(sp: SearchParams, clave: string): string {
  const v = sp[clave];
  return typeof v === 'string' ? v : '';
}

export default async function StockPage({ searchParams }: { searchParams: SearchParams }) {
  const empresa = cookies().get('sfb_empresa')?.value ?? 'SF';
  const q = valorParam(searchParams, 'q');
  const estado = valorParam(searchParams, 'estado');
  const almacen = valorParam(searchParams, 'almacen');
  const pagina = Math.max(1, Number(valorParam(searchParams, 'pagina') || '1') || 1);

  const d = await getStockAlmacen(empresa, { q, estado, almacen });
  const totalPaginas = Math.max(1, Math.ceil(d.filas.length / TAMANO_PAGINA_VISTA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * TAMANO_PAGINA_VISTA;
  const visibles = d.filas.slice(inicio, inicio + TAMANO_PAGINA_VISTA);
  const conFiltro = Boolean(q || d.filtros.estado !== 'todos' || almacen);

  const enlacePagina = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (d.filtros.estado !== 'todos') p.set('estado', d.filtros.estado);
    if (almacen) p.set('almacen', almacen);
    if (n > 1) p.set('pagina', String(n));
    const s = p.toString();
    return s ? `/stock?${s}` : '/stock';
  };

  return (
    <div>
      <p className="breadcrumb">Cuadro mando comercial · Bloque 4</p>
      <h1>Stock y cobertura</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Existencias reales de {d.empresa.nombre} por artículo, almacén y lote (contenedor), extraídas de A3ERP.
      </p>

      <ul className="grid-kpis">
        <Kpi etiqueta="Referencias con stock" valor={numero(d.refsConStock)} nota={`de ${numero(d.referencias)} referencias`} />
        <Kpi etiqueta="Referencias sin stock" valor={numero(d.refsSinStock)} nota="a cero en todos los almacenes" />
        <Kpi etiqueta="Unidades en stock" valor={numero(d.unidades)} nota="suma de todos los almacenes y lotes" />
        <Kpi etiqueta="Valor de stock" valor={eur(d.valor)} nota="a coste medio de A3ERP" />
      </ul>

      <div className="card">
        <h2>Existencias por artículo</h2>
        <form method="get" action="/stock" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Buscar</span>
            <input name="q" defaultValue={q} placeholder="Código, artículo, lote o almacén" style={{ minWidth: 260 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Stock</span>
            <select name="estado" defaultValue={d.filtros.estado}>
              <option value="todos">Todos</option>
              <option value="con">Con stock</option>
              <option value="sin">Sin stock</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Almacén</span>
            <select name="almacen" defaultValue={almacen}>
              <option value="">Todos</option>
              {d.almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo} · {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Filtrar</button>
          {conFiltro && (
            <a href="/stock" style={{ alignSelf: 'center' }}>
              Limpiar
            </a>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <DescargarExcel
              nombre={`stock-${d.empresa.codigo.toLowerCase()}`}
              columnas={['Artículo', 'Nombre', 'Almacén', 'Almacén nombre', 'Lote', 'Stock', 'Coste medio', 'Valor', 'Ubicación', 'Caducidad']}
              registros={d.filas.map((f) => [
                f.articulo_codigo,
                f.articulo_nombre ?? '',
                f.almacen_codigo,
                f.almacen_nombre ?? '',
                f.lote,
                f.unidades,
                f.coste_medio ?? '',
                f.unidades * Number(f.coste_medio ?? 0),
                f.ubicacion ?? '',
                f.fecha_caducidad ?? '',
              ])}
            />
          </div>
        </form>

        <p style={{ color: 'var(--muted)' }}>
          {numero(d.totalFilas)} líneas · mostrando {visibles.length === 0 ? 0 : inicio + 1}–{inicio + visibles.length}
        </p>

        {visibles.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No hay existencias que cumplan el filtro.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Artículo</th>
                  <th>Almacén</th>
                  <th>Lote</th>
                  <th className="td-num">Stock</th>
                  <th className="td-num">Coste medio</th>
                  <th className="td-num">Valor</th>
                  <th>Ubicación</th>
                  <th>Caducidad</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={`${f.articulo_codigo}|${f.almacen_codigo}|${f.lote}`}>
                    <td>{f.articulo_codigo}</td>
                    <td>{f.articulo_nombre ?? '—'}</td>
                    <td>{f.almacen_codigo}{f.almacen_nombre ? ` · ${f.almacen_nombre}` : ''}</td>
                    <td>{f.lote || '—'}</td>
                    <td className="td-num">{numero(f.unidades)}</td>
                    <td className="td-num">{f.coste_medio === null ? '—' : eur(f.coste_medio)}</td>
                    <td className="td-num">{eur(f.unidades * Number(f.coste_medio ?? 0))}</td>
                    <td>{f.ubicacion || '—'}</td>
                    <td>{f.fecha_caducidad || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPaginas > 1 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
            {paginaActual > 1 ? <a href={enlacePagina(paginaActual - 1)}>← Anterior</a> : <span />}
            <span>
              Página {paginaActual} de {totalPaginas}
            </span>
            {paginaActual < totalPaginas ? <a href={enlacePagina(paginaActual + 1)}>Siguiente →</a> : <span />}
          </div>
        )}
      </div>
    </div>
  );
}
