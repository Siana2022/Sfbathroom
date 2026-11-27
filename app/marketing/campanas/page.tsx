import Link from 'next/link';
import { cookies } from 'next/headers';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { createClient } from '@/lib/supabase/server';
import { getUsuario } from '@/lib/datos/role';
import { EMPRESAS } from '@/lib/empresas';
import NuevaCampana from '@/components/NuevaCampana';

export default async function CampanasPage() {
  const empresaCodigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(empresaCodigo);
  const usuario = await getUsuario();
  const supabase = createClient();

  const esComercial = usuario?.rol === 'comercial';
  const { data: empresasRaw } = await supabase.from('empresas').select('id, codigo').order('codigo');
  // Mismo orden que en la cabecera (SF, DOT, FUX), no el alfabético.
  const orden = new Map(EMPRESAS.map((e, i) => [e.codigo as string, i]));
  const empresasTodas = ((empresasRaw ?? []) as { id: string; codigo: string }[]).sort(
    (a, b) => (orden.get(a.codigo) ?? 99) - (orden.get(b.codigo) ?? 99),
  );
  // El comercial ve todas sus campañas (las tres empresas); el resto, las de la empresa.
  let consulta = supabase
    .from('campanas_email')
    .select('id, nombre, asunto, estado, total, enviados, fallidos, created_at, enviada_at, empresa_id, empresas(codigo)')
    .order('created_at', { ascending: false });
  if (!esComercial) consulta = consulta.eq('empresa_id', empresa.id);
  const { data } = await consulta;

  const campanas = (data ?? []) as {
    id: string;
    nombre: string;
    asunto: string;
    estado: string;
    total: number;
    enviados: number;
    fallidos: number;
    created_at: string;
    enviada_at: string | null;
    empresas: { codigo: string }[] | null;
  }[];

  const puede = usuario?.rol === 'admin' || usuario?.rol === 'direccion' || usuario?.rol === 'comercial';

  return (
    <div>
      <p className="breadcrumb">Marketing · Email</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 6 }}>Campañas de email</h1>
        <span style={{ display: 'flex', gap: 8 }}>
          <Link href="/marketing/plantillas" className="boton">Plantillas</Link>
          {(usuario?.rol === 'admin' || usuario?.rol === 'direccion') && (
            <Link href="/marketing/bajas" className="boton">Bajas</Link>
          )}
        </span>
      </div>
      {!puede ? (
        <div className="card"><p>Solo administración, dirección y comerciales pueden gestionar campañas.</p></div>
      ) : (
        <>
          <NuevaCampana
            empresaId={esComercial ? undefined : empresa.id}
            empresas={esComercial ? empresasTodas : [{ id: empresa.id, codigo: empresa.codigo }]}
          />
          <div className="card">
            <h2>Campañas ({campanas.length})</h2>
            {campanas.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Todavía no hay campañas.</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    {esComercial ? <th>Empresa</th> : null}
                    <th>Nombre</th>
                    <th>Asunto</th>
                    <th>Estado</th>
                    <th className="td-num">Enviados</th>
                    <th className="td-num">Fallidos</th>
                    <th>Creada</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {campanas.map((c) => (
                    <tr key={c.id}>
                      {esComercial ? <td><span className="badge">{c.empresas?.[0]?.codigo ?? '—'}</span></td> : null}
                      <td>{c.nombre}</td>
                      <td>{c.asunto || '—'}</td>
                      <td><span className={c.estado === 'enviada' ? 'badge listo' : 'badge construccion'}>{c.estado}</span></td>
                      <td className="td-num">{c.enviados}</td>
                      <td className="td-num">{c.fallidos}</td>
                      <td>{c.created_at.slice(0, 10)}</td>
                      <td><Link className="enlace" href={`/marketing/campanas/${c.id}`}>Abrir</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
