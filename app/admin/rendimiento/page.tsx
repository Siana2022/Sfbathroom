import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { getClientes } from '@/lib/datos/clientes';
import { getFacturacion } from '@/lib/datos/facturacion';
import { getUsuario } from '@/lib/datos/role';
import { ANIO_ACTUAL } from '@/lib/ejercicio';
import { ventasFacturasRangoRpc } from '@/lib/datos/ventas';

async function medir<T>(nombre: string, fn: () => Promise<T>): Promise<{ nombre: string; ms: number; ok: boolean; error?: string }> {
  const t0 = performance.now();
  try {
    await fn();
    return { nombre, ms: Math.round(performance.now() - t0), ok: true };
  } catch (e) {
    return { nombre, ms: Math.round(performance.now() - t0), ok: false, error: (e as Error).message };
  }
}

export default async function RendimientoPage() {
  const usuario = await getUsuario();
  if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'direccion')) {
    return <div className="card"><p>Solo administración y dirección.</p></div>;
  }
  const supabase = createClient();
  const codigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(codigo);

  const mediciones = [];
  mediciones.push(
    await medir('Conteo facturas (head)', async () => {
      await supabase.from('facturas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id);
    }),
  );
  mediciones.push(
    await medir('Conteo clientes (head)', async () => {
      await supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id);
    }),
  );
  const hace730 = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  mediciones.push(await medir('Facturas 2 años (RPC)', () => ventasFacturasRangoRpc(supabase, codigo, hace730, `${ANIO_ACTUAL}-12-31`)));
  mediciones.push(
    await medir('RPC clientes_actividad', async () => {
      await supabase.rpc('clientes_actividad', {
        p_codigo_empresa: codigo,
        p_anio: ANIO_ACTUAL,
        p_cliente: null,
        p_comercial: null,
        p_familia: null,
        p_marca: null,
      });
    }),
  );
  mediciones.push(
    await medir('RPC clientes_margen', async () => {
      await supabase.rpc('clientes_margen', {
        p_codigo_empresa: codigo,
        p_anio: ANIO_ACTUAL,
        p_cliente: null,
        p_comercial: null,
        p_familia: null,
        p_marca: null,
      });
    }),
  );
  mediciones.push(
    await medir('Artículos (todas las filas)', async () => {
      let desde = 0;
      for (;;) {
        const { data } = await supabase.from('articulos').select('id, familia').eq('empresa_id', empresa.id).range(desde, desde + 999);
        if (!data || data.length < 1000) break;
        desde += 1000;
      }
    }),
  );
  mediciones.push(await medir('getClientes', () => getClientes(codigo, ANIO_ACTUAL, {})));
  mediciones.push(await medir('getFacturacion', () => getFacturacion(codigo, ANIO_ACTUAL, {})));

  const total = mediciones.reduce((s, m) => s + m.ms, 0);

  return (
    <div>
      <p className="breadcrumb">Administración · Rendimiento</p>
      <h1>Diagnóstico de rendimiento</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Tiempos medidos en el servidor para la empresa {codigo}. Refresca un par de veces: la primera
        puede incluir arranque en frío.
      </p>
      <div className="card">
        <h2>Suma: {total} ms</h2>
        <table className="tabla">
          <thead>
            <tr><th>Consulta</th><th className="td-num">Tiempo</th><th /></tr>
          </thead>
          <tbody>
            {mediciones.map((m) => (
              <tr key={m.nombre}>
                <td>{m.nombre}</td>
                <td className="td-num">{m.ms} ms</td>
                <td>{m.ok ? 'ok' : `error: ${m.error}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
