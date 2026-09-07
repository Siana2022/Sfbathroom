import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaPorCodigo } from '@/lib/datos/facturacion';
import { bloques } from '@/lib/bloques';

export const dynamic = 'force-dynamic';

const VISTAS = [
  {
    nombre: 'Operativa',
    frecuencia: 'Semanal',
    destinatarios: ['Dirección', 'Comercial', 'Administración'],
    descripcion:
      'El pulso de la semana: cómo entran los pedidos, cuánta cartera hay pendiente, si el stock aguanta y qué cobros se atrasan. Es la vista que se abre los lunes.',
    bloques: [
      { slug: '/pedidos', etiqueta: 'Entrada de pedidos y cartera (B2)' },
      { slug: '/stock', etiqueta: 'Cobertura de stock y roturas (B4)' },
      { slug: '/credito-cobro', etiqueta: 'Cobros y vencidos (B8)' },
      { slug: '/facturacion', etiqueta: 'Facturación de la semana (B1)' },
    ],
  },
  {
    nombre: 'Comercial',
    frecuencia: 'Mensual',
    destinatarios: ['Dirección', 'Comercial'],
    descripcion:
      'El cierre del mes: facturación con todos los desgloses, qué explicó la variación, cuánto margen dejó cada cliente y producto, quién se está yendo y el cumplimiento de presupuesto.',
    bloques: [
      { slug: '/facturacion', etiqueta: 'Facturación y variación (B1)' },
      { slug: '/margen', etiqueta: 'Margen por cliente y producto (B3)' },
      { slug: '/clientes', etiqueta: 'Comportamiento y fuga de clientes (B5)' },
      { slug: '/canal-y-marca', etiqueta: 'Canal y marca (B6)' },
      { slug: '/actividad-comercial', etiqueta: 'Actividad comercial (B9)' },
    ],
  },
  {
    nombre: 'Estratégica',
    frecuencia: 'Trimestral',
    destinatarios: ['Dirección', 'Consejo'],
    descripcion:
      'Los indicadores que se miran con perspectiva: concentración de la cartera, avance de Starbath Plus, riesgo del proveedor único, rentabilidad por canal y saturación del equipo.',
    bloques: [
      { slug: '/concentracion', etiqueta: 'Concentración de cartera (B7)' },
      { slug: '/canal-y-marca', etiqueta: 'Evolución de Starbath Plus (B6)' },
      { slug: '/margen', etiqueta: 'Rentabilidad por canal (B3)' },
      { slug: '/alertas', etiqueta: 'Alertas (B11)' },
    ],
  },
];

export default async function CuadrosPage() {
  const codigo = cookies().get('sfb_empresa')?.value ?? 'SF';
  const empresa = await getEmpresaPorCodigo(codigo);

  const supabase = createClient();
  const { data: empresas } = await supabase.from('empresas').select('codigo, nombre');

  return (
    <div>
      <p className="breadcrumb">Cuadro de mando · Bloque 12</p>
      <h1>Cuadros por perfil y cadencia</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Cuatro formas de mirar el mismo modelo de datos, según quién mira y cada cuánto. Todas
        responden desde la vista actual ({empresa.nombre}).
      </p>

      {VISTAS.map((v) => (
        <div className="card" key={v.nombre}>
          <h2>
            {v.nombre} <span className="badge rol">cada {v.frecuencia}</span>
          </h2>
          <p style={{ color: 'var(--muted)', maxWidth: 760 }}>{v.descripcion}</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0' }}>
            Para: {v.destinatarios.join(' · ')}
          </p>
          <ul className="tablas">
            {v.bloques.map((b) => {
              const blk = bloques.find((x) => x.slug === b.slug);
              return (
                <li key={b.slug}>
                  <Link href={b.slug} style={{ color: 'var(--accent)' }}>
                    {b.etiqueta}
                  </Link>
                  {blk?.resumen ? <span> — {blk.resumen.slice(0, 90)}…</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="card">
        <h2>Consolidada de holding</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          SF Bathroom más DOT Surfaces (y Fuxsabany) en un mismo número: facturación, margen,
          carga del equipo compartido y tesorería conjunta. Requiere cargar datos de las demás
          empresas en el mismo esquema; hoy solo hay datos demo de SF.
        </p>
        <ul className="tablas">
          {((empresas ?? []) as { codigo: string; nombre: string }[]).map((e) => (
            <li key={e.codigo}>
              {e.nombre}
              <span style={{ color: 'var(--muted)' }}> — {e.codigo === empresa.codigo ? 'con datos' : 'sin datos cargados'}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Alertas destacadas en portada</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
          La portada (Resumen) destaca los clientes del top 10 en semáforo ámbar o rojo. Todas las
          señales se revisan desde el bloque de alertas.
        </p>
        <p>
          <Link href="/alertas" style={{ color: 'var(--accent)' }}>
            Ver todas las señales →
          </Link>
        </p>
      </div>
    </div>
  );
}