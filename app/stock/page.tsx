import { cookies } from 'next/headers';
import { getStockAlmacen } from '@/lib/datos/stockAlmacen';
import { eur, numero } from '@/lib/formato';
import Kpi from '@/components/Kpi';
import DescargarExcel from '@/components/DescargarExcel';
import TablaStock from '@/components/TablaStock';
import type { SearchParams } from '@/lib/datos/filtros';

const TAMANO_PAGINA_VISTA = 50;

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
  const totalPaginas = Math.max(1, Math.ceil(d.grupos.length / TAMANO_PAGINA_VISTA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * TAMANO_PAGINA_VISTA;
  const visibles = d.grupos.slice(inicio, inicio + TAMANO_PAGINA_VISTA);
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
        <Kpi etiqueta="Valor de stock" valor={eur(d.valor)} nota="a coste real de compra" />
        <Kpi etiqueta="Stock pendiente" valor={numero(d.totalEnMar)} nota={`${numero(d.articulosEnMar)} artículos pendientes de recibir`} />
      </ul>


      <div className="card">
        <h2>Existencias por artículo</h2>
        <p className="nota" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Cada artículo agrupa sus modelos, almacenes y lotes. Pincha para desplegarlos. El coste sale
          del precio de compra por el cambio de la factura del lote; si no hay compra de ese lote, se
          usa la última del artículo.
        </p>
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
              columnas={['Artículo', 'Nombre', 'Almacén', 'Almacén nombre', 'Lote', 'Stock', 'Coste', 'Valor', 'Ubicación']}
              registros={d.filas.map((f) => [
                f.articulo_codigo,
                f.articulo_nombre ?? '',
                f.almacen_codigo,
                f.almacen_nombre ?? '',
                f.lote,
                f.unidades,
                f.coste ?? '',
                f.unidades * Number(f.coste ?? 0),
                f.ubicacion ?? '',
              ])}
            />
          </div>
        </form>

        <p style={{ color: 'var(--muted)' }}>
          {numero(d.grupos.length)} artículos · mostrando {visibles.length === 0 ? 0 : inicio + 1}–{inicio + visibles.length}
        </p>

        <TablaStock grupos={visibles} />

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

      <div className="card">
        <h2>Stock pendiente</h2>
        <p className="nota" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Mercancía pedida a proveedor que todavía no se ha recibido. En A3ERP no hay reservas de clientes: lo pendiente son pedidos de compra sin recepción.
        </p>
        {d.enMarFilas.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No hay pedidos pendientes de recibir.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Nombre</th>
                <th className="td-num" title="Unidades pedidas pendientes de recibir.">Unidades</th>
                <th className="td-num" title="Número de pedidos de compra que las incluyen.">Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {d.enMarFilas.map((m) => (
                <tr key={m.articulo_codigo}>
                  <td>{m.articulo_codigo}</td>
                  <td title={m.articulo_nombre ?? ''}>{m.articulo_nombre ?? '—'}</td>
                  <td className="td-num">{numero(m.unidades)}</td>
                  <td className="td-num">{numero(m.pedidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {d.alertas.length > 0 && (
        <div className="card">
          <h2>Alertas de stock</h2>
          <p className="nota" style={{ color: 'var(--muted)', marginTop: 0 }}>
            Roturas y artículos por debajo del punto de pedido. La propuesta de compra usa el consumo
            de los últimos 90 días y 45 días de cobertura.
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th title="Rotura: sin stock y con ventas. Bajo punto: por debajo del punto de pedido configurado.">Estado</th>
                <th className="td-num" title="Unidades en stock sumando almacenes y lotes.">Stock</th>
                <th className="td-num" title="Punto de pedido configurado en el artículo.">Punto pedido</th>
                <th className="td-num" title="Unidades vendidas en 90 días dividido entre 90.">Consumo/día</th>
                <th className="td-num" title="Pedidas a proveedor pendientes de recibir.">En mar</th>
                <th className="td-num" title="Unidades sugeridas a comprar para cubrir 45 días, descontando lo que ya viene.">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {d.alertas.map((a) => (
                <tr key={a.codigo}>
                  <td title={a.articulo}>{a.articulo}</td>
                  <td style={a.rotura ? { color: 'var(--rojo)', fontWeight: 600 } : undefined}>
                    {a.rotura ? 'Rotura' : a.punto > 0 && a.stock < a.punto ? 'Bajo punto' : '—'}
                  </td>
                  <td className="td-num">{numero(a.stock)}</td>
                  <td className="td-num">{a.punto > 0 ? numero(a.punto) : '—'}</td>
                  <td className="td-num">{a.mediaDiaria.toFixed(2)}</td>
                  <td className="td-num">{a.enMar > 0 ? numero(a.enMar) : '—'}</td>
                  <td className="td-num">{a.propuesta > 0 ? numero(a.propuesta) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


    </div>
  );
}
